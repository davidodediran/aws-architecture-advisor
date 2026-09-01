import type {
  ArchitectureModel,
  Resource,
  NetworkTopology,
  SecurityGroup,
  IamRole,
} from '@aws-arch-advisor/shared';

export interface CfnTemplate {
  AWSTemplateFormatVersion: '2010-09-09';
  Description: string;
  Parameters: Record<string, CfnParameter>;
  Resources: Record<string, CfnResource>;
  Outputs: Record<string, CfnOutput>;
}

interface CfnParameter {
  Type: string;
  Default?: string;
  AllowedValues?: string[];
  Description?: string;
}

interface CfnResource {
  Type: string;
  Properties: Record<string, unknown>;
  DependsOn?: string | string[];
}

interface CfnOutput {
  Description: string;
  Value: unknown;
  Export?: { Name: unknown };
}

type ResourceMapper = (resource: Resource, architecture: ArchitectureModel) => Record<string, CfnResource>;

function sanitizeLogicalId(name: string): string {
  return name.replace(/[^a-zA-Z0-9]/g, '');
}

const SERVICE_MAPPERS: Record<string, ResourceMapper> = {
  lambda: (resource) => {
    const logicalId = sanitizeLogicalId(resource.name);
    const runtime = (resource.config.runtime as string) ?? 'nodejs20.x';
    const memorySize = (resource.config.memorySize as number) ?? 128;
    const timeout = (resource.config.timeout as number) ?? 30;
    const handler = (resource.config.handler as string) ?? 'index.handler';
    const architecture = (resource.config.architecture as string) ?? 'arm64';

    const roleName = `${logicalId}ExecutionRole`;
    const resources: Record<string, CfnResource> = {};

    resources[roleName] = {
      Type: 'AWS::IAM::Role',
      Properties: {
        RoleName: { 'Fn::Sub': `\${NamingPrefix}-${logicalId}-role` },
        AssumeRolePolicyDocument: {
          Version: '2012-10-17',
          Statement: [
            {
              Effect: 'Allow',
              Principal: { Service: 'lambda.amazonaws.com' },
              Action: 'sts:AssumeRole',
            },
          ],
        },
        ManagedPolicyArns: [
          'arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole',
        ],
      },
    };

    resources[logicalId] = {
      Type: 'AWS::Lambda::Function',
      Properties: {
        FunctionName: { 'Fn::Sub': `\${NamingPrefix}-${resource.name}` },
        Runtime: runtime,
        Handler: handler,
        MemorySize: memorySize,
        Timeout: timeout,
        Architectures: [architecture],
        Role: { 'Fn::GetAtt': [roleName, 'Arn'] },
        Environment: {
          Variables: {
            ENVIRONMENT: { Ref: 'Environment' },
          },
        },
        Tags: [
          { Key: 'ManagedBy', Value: 'aws-arch-advisor' },
        ],
      },
      DependsOn: roleName,
    };

    return resources;
  },

  dynamodb: (resource) => {
    const logicalId = sanitizeLogicalId(resource.name);
    const billingMode = (resource.config.billingMode as string) ?? 'PAY_PER_REQUEST';
    const partitionKey = (resource.config.partitionKey as string) ?? 'pk';
    const sortKey = resource.config.sortKey as string | undefined;

    const keySchema = [{ AttributeName: partitionKey, KeyType: 'HASH' }];
    const attributeDefinitions = [{ AttributeName: partitionKey, AttributeType: 'S' }];

    if (sortKey) {
      keySchema.push({ AttributeName: sortKey, KeyType: 'RANGE' });
      attributeDefinitions.push({ AttributeName: sortKey, AttributeType: 'S' });
    }

    const properties: Record<string, unknown> = {
      TableName: { 'Fn::Sub': `\${NamingPrefix}-${resource.name}` },
      BillingMode: billingMode,
      KeySchema: keySchema,
      AttributeDefinitions: attributeDefinitions,
      PointInTimeRecoverySpecification: { PointInTimeRecoveryEnabled: true },
      SSESpecification: { SSEEnabled: true },
      Tags: [{ Key: 'ManagedBy', Value: 'aws-arch-advisor' }],
    };

    const gsis = resource.config.globalSecondaryIndexes as Array<{
      indexName: string;
      partitionKey: string;
      sortKey?: string;
    }> | undefined;

    if (gsis && gsis.length > 0) {
      const gsiDefinitions = gsis.map((gsi) => {
        const gsiKeySchema = [{ AttributeName: gsi.partitionKey, KeyType: 'HASH' }];
        if (!attributeDefinitions.find((a) => a.AttributeName === gsi.partitionKey)) {
          attributeDefinitions.push({ AttributeName: gsi.partitionKey, AttributeType: 'S' });
        }
        if (gsi.sortKey) {
          gsiKeySchema.push({ AttributeName: gsi.sortKey, KeyType: 'RANGE' });
          if (!attributeDefinitions.find((a) => a.AttributeName === gsi.sortKey)) {
            attributeDefinitions.push({ AttributeName: gsi.sortKey!, AttributeType: 'S' });
          }
        }
        return {
          IndexName: gsi.indexName,
          KeySchema: gsiKeySchema,
          Projection: { ProjectionType: 'ALL' },
        };
      });
      properties.GlobalSecondaryIndexes = gsiDefinitions;
    }

    return { [logicalId]: { Type: 'AWS::DynamoDB::Table', Properties: properties } };
  },

  s3: (resource) => {
    const logicalId = sanitizeLogicalId(resource.name);
    return {
      [logicalId]: {
        Type: 'AWS::S3::Bucket',
        Properties: {
          BucketName: { 'Fn::Sub': `\${NamingPrefix}-${resource.name}-\${AWS::AccountId}` },
          BucketEncryption: {
            ServerSideEncryptionConfiguration: [
              {
                ServerSideEncryptionByDefault: {
                  SSEAlgorithm: (resource.config.sseAlgorithm as string) ?? 'AES256',
                },
              },
            ],
          },
          PublicAccessBlockConfiguration: {
            BlockPublicAcls: true,
            BlockPublicPolicy: true,
            IgnorePublicAcls: true,
            RestrictPublicBuckets: true,
          },
          VersioningConfiguration: {
            Status: resource.config.versioning !== false ? 'Enabled' : 'Suspended',
          },
          Tags: [{ Key: 'ManagedBy', Value: 'aws-arch-advisor' }],
        },
      },
    };
  },

  'rds-aurora-serverless': (resource) => {
    const logicalId = sanitizeLogicalId(resource.name);
    const engine = (resource.config.engine as string) ?? 'aurora-postgresql';
    const minCapacity = (resource.config.minCapacity as number) ?? 0.5;
    const maxCapacity = (resource.config.maxCapacity as number) ?? 2;

    return {
      [logicalId]: {
        Type: 'AWS::RDS::DBCluster',
        Properties: {
          DBClusterIdentifier: { 'Fn::Sub': `\${NamingPrefix}-${resource.name}` },
          Engine: engine,
          EngineMode: 'provisioned',
          ServerlessV2ScalingConfiguration: {
            MinCapacity: minCapacity,
            MaxCapacity: maxCapacity,
          },
          StorageEncrypted: true,
          BackupRetentionPeriod: (resource.config.backupRetentionDays as number) ?? 7,
          DeletionProtection: false,
          MasterUsername: { 'Fn::Sub': `\${NamingPrefix}admin` },
          ManageMasterUserPassword: true,
          Tags: [{ Key: 'ManagedBy', Value: 'aws-arch-advisor' }],
        },
      },
    };
  },

  'api-gateway': (resource) => {
    const logicalId = sanitizeLogicalId(resource.name);
    return {
      [logicalId]: {
        Type: 'AWS::ApiGateway::RestApi',
        Properties: {
          Name: { 'Fn::Sub': `\${NamingPrefix}-${resource.name}` },
          Description: resource.config.description ?? `REST API for ${resource.name}`,
          EndpointConfiguration: {
            Types: [(resource.config.endpointType as string) ?? 'REGIONAL'],
          },
          Tags: [{ Key: 'ManagedBy', Value: 'aws-arch-advisor' }],
        },
      },
    };
  },

  cloudfront: (resource) => {
    const logicalId = sanitizeLogicalId(resource.name);
    const originDomain = (resource.config.originDomainName as string) ?? 'placeholder.s3.amazonaws.com';
    return {
      [logicalId]: {
        Type: 'AWS::CloudFront::Distribution',
        Properties: {
          DistributionConfig: {
            Enabled: true,
            DefaultCacheBehavior: {
              TargetOriginId: `${logicalId}Origin`,
              ViewerProtocolPolicy: 'redirect-to-https',
              AllowedMethods: ['GET', 'HEAD'],
              CachedMethods: ['GET', 'HEAD'],
              ForwardedValues: { QueryString: false },
            },
            Origins: [
              {
                Id: `${logicalId}Origin`,
                DomainName: originDomain,
                S3OriginConfig: { OriginAccessIdentity: '' },
              },
            ],
            DefaultRootObject: 'index.html',
          },
          Tags: [{ Key: 'ManagedBy', Value: 'aws-arch-advisor' }],
        },
      },
    };
  },

  cognito: (resource) => {
    const logicalId = sanitizeLogicalId(resource.name);
    return {
      [logicalId]: {
        Type: 'AWS::Cognito::UserPool',
        Properties: {
          UserPoolName: { 'Fn::Sub': `\${NamingPrefix}-${resource.name}` },
          AutoVerifiedAttributes: ['email'],
          UsernameAttributes: ['email'],
          Policies: {
            PasswordPolicy: {
              MinimumLength: 8,
              RequireLowercase: true,
              RequireUppercase: true,
              RequireNumbers: true,
              RequireSymbols: false,
            },
          },
          Schema: [
            {
              Name: 'email',
              AttributeDataType: 'String',
              Required: true,
              Mutable: true,
            },
          ],
        },
      },
    };
  },

  sqs: (resource) => {
    const logicalId = sanitizeLogicalId(resource.name);
    const resources: Record<string, CfnResource> = {};
    const visibilityTimeout = (resource.config.visibilityTimeout as number) ?? 30;

    if (resource.config.deadLetterQueue !== false) {
      const dlqLogicalId = `${logicalId}DLQ`;
      resources[dlqLogicalId] = {
        Type: 'AWS::SQS::Queue',
        Properties: {
          QueueName: { 'Fn::Sub': `\${NamingPrefix}-${resource.name}-dlq` },
          MessageRetentionPeriod: 1209600,
          Tags: [{ Key: 'ManagedBy', Value: 'aws-arch-advisor' }],
        },
      };

      resources[logicalId] = {
        Type: 'AWS::SQS::Queue',
        Properties: {
          QueueName: { 'Fn::Sub': `\${NamingPrefix}-${resource.name}` },
          VisibilityTimeout: visibilityTimeout,
          RedrivePolicy: {
            deadLetterTargetArn: { 'Fn::GetAtt': [dlqLogicalId, 'Arn'] },
            maxReceiveCount: (resource.config.maxReceiveCount as number) ?? 3,
          },
          Tags: [{ Key: 'ManagedBy', Value: 'aws-arch-advisor' }],
        },
        DependsOn: dlqLogicalId,
      };
    } else {
      resources[logicalId] = {
        Type: 'AWS::SQS::Queue',
        Properties: {
          QueueName: { 'Fn::Sub': `\${NamingPrefix}-${resource.name}` },
          VisibilityTimeout: visibilityTimeout,
          Tags: [{ Key: 'ManagedBy', Value: 'aws-arch-advisor' }],
        },
      };
    }

    return resources;
  },

  'ecs-fargate': (resource) => {
    const logicalId = sanitizeLogicalId(resource.name);
    const cpu = (resource.config.cpu as number) ?? 256;
    const memory = (resource.config.memory as number) ?? 512;
    const containerPort = (resource.config.containerPort as number) ?? 80;
    const image = (resource.config.image as string) ?? 'public.ecr.aws/nginx/nginx:latest';

    const clusterName = `${logicalId}Cluster`;
    const taskDefName = `${logicalId}TaskDef`;
    const roleName = `${logicalId}TaskExecutionRole`;

    const resources: Record<string, CfnResource> = {};

    resources[clusterName] = {
      Type: 'AWS::ECS::Cluster',
      Properties: {
        ClusterName: { 'Fn::Sub': `\${NamingPrefix}-${resource.name}-cluster` },
        Tags: [{ Key: 'ManagedBy', Value: 'aws-arch-advisor' }],
      },
    };

    resources[roleName] = {
      Type: 'AWS::IAM::Role',
      Properties: {
        AssumeRolePolicyDocument: {
          Version: '2012-10-17',
          Statement: [
            {
              Effect: 'Allow',
              Principal: { Service: 'ecs-tasks.amazonaws.com' },
              Action: 'sts:AssumeRole',
            },
          ],
        },
        ManagedPolicyArns: [
          'arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy',
        ],
      },
    };

    resources[taskDefName] = {
      Type: 'AWS::ECS::TaskDefinition',
      Properties: {
        Family: { 'Fn::Sub': `\${NamingPrefix}-${resource.name}` },
        Cpu: String(cpu),
        Memory: String(memory),
        NetworkMode: 'awsvpc',
        RequiresCompatibilities: ['FARGATE'],
        ExecutionRoleArn: { 'Fn::GetAtt': [roleName, 'Arn'] },
        ContainerDefinitions: [
          {
            Name: resource.name,
            Image: image,
            PortMappings: [{ ContainerPort: containerPort, Protocol: 'tcp' }],
            LogConfiguration: {
              LogDriver: 'awslogs',
              Options: {
                'awslogs-group': { 'Fn::Sub': `/ecs/\${NamingPrefix}-${resource.name}` },
                'awslogs-region': { Ref: 'AWS::Region' },
                'awslogs-stream-prefix': 'ecs',
              },
            },
          },
        ],
        Tags: [{ Key: 'ManagedBy', Value: 'aws-arch-advisor' }],
      },
      DependsOn: roleName,
    };

    resources[logicalId] = {
      Type: 'AWS::ECS::Service',
      Properties: {
        ServiceName: { 'Fn::Sub': `\${NamingPrefix}-${resource.name}` },
        Cluster: { Ref: clusterName },
        TaskDefinition: { Ref: taskDefName },
        DesiredCount: (resource.config.desiredCount as number) ?? 1,
        LaunchType: 'FARGATE',
        Tags: [{ Key: 'ManagedBy', Value: 'aws-arch-advisor' }],
      },
      DependsOn: [clusterName, taskDefName],
    };

    return resources;
  },

  ec2: (resource) => {
    const logicalId = sanitizeLogicalId(resource.name);
    return {
      [logicalId]: {
        Type: 'AWS::EC2::Instance',
        Properties: {
          InstanceType: (resource.config.instanceType as string) ?? 't3.micro',
          ImageId: (resource.config.imageId as string) ?? 'ami-placeholder',
          Tags: [
            { Key: 'Name', Value: { 'Fn::Sub': `\${NamingPrefix}-${resource.name}` } },
            { Key: 'ManagedBy', Value: 'aws-arch-advisor' },
          ],
        },
      },
    };
  },

  elasticache: (resource) => {
    const logicalId = sanitizeLogicalId(resource.name);
    return {
      [logicalId]: {
        Type: 'AWS::ElastiCache::CacheCluster',
        Properties: {
          ClusterName: { 'Fn::Sub': `\${NamingPrefix}-${resource.name}` },
          Engine: (resource.config.engine as string) ?? 'redis',
          CacheNodeType: (resource.config.nodeType as string) ?? 'cache.t3.micro',
          NumCacheNodes: (resource.config.numNodes as number) ?? 1,
          Tags: [{ Key: 'ManagedBy', Value: 'aws-arch-advisor' }],
        },
      },
    };
  },

  sns: (resource) => {
    const logicalId = sanitizeLogicalId(resource.name);
    return {
      [logicalId]: {
        Type: 'AWS::SNS::Topic',
        Properties: {
          TopicName: { 'Fn::Sub': `\${NamingPrefix}-${resource.name}` },
          KmsMasterKeyId: 'alias/aws/sns',
          Tags: [{ Key: 'ManagedBy', Value: 'aws-arch-advisor' }],
        },
      },
    };
  },

  'step-functions': (resource) => {
    const logicalId = sanitizeLogicalId(resource.name);
    return {
      [logicalId]: {
        Type: 'AWS::StepFunctions::StateMachine',
        Properties: {
          StateMachineName: { 'Fn::Sub': `\${NamingPrefix}-${resource.name}` },
          StateMachineType: (resource.config.type as string) ?? 'STANDARD',
          DefinitionString: JSON.stringify(resource.config.definition ?? { StartAt: 'Pass', States: { Pass: { Type: 'Pass', End: true } } }),
          Tags: [{ Key: 'ManagedBy', Value: 'aws-arch-advisor' }],
        },
      },
    };
  },

  kinesis: (resource) => {
    const logicalId = sanitizeLogicalId(resource.name);
    return {
      [logicalId]: {
        Type: 'AWS::Kinesis::Stream',
        Properties: {
          Name: { 'Fn::Sub': `\${NamingPrefix}-${resource.name}` },
          ShardCount: (resource.config.shardCount as number) ?? 1,
          RetentionPeriodHours: (resource.config.retentionHours as number) ?? 24,
          StreamModeDetails: { StreamMode: 'PROVISIONED' },
          Tags: [{ Key: 'ManagedBy', Value: 'aws-arch-advisor' }],
        },
      },
    };
  },

  opensearch: (resource) => {
    const logicalId = sanitizeLogicalId(resource.name);
    return {
      [logicalId]: {
        Type: 'AWS::OpenSearchService::Domain',
        Properties: {
          DomainName: { 'Fn::Sub': `\${NamingPrefix}-${resource.name}` },
          EngineVersion: (resource.config.engineVersion as string) ?? 'OpenSearch_2.11',
          ClusterConfig: {
            InstanceType: (resource.config.instanceType as string) ?? 't3.small.search',
            InstanceCount: (resource.config.instanceCount as number) ?? 1,
          },
          EBSOptions: {
            EBSEnabled: true,
            VolumeSize: (resource.config.volumeSizeGb as number) ?? 10,
            VolumeType: 'gp3',
          },
          EncryptionAtRestOptions: { Enabled: true },
          NodeToNodeEncryptionOptions: { Enabled: true },
          Tags: [{ Key: 'ManagedBy', Value: 'aws-arch-advisor' }],
        },
      },
    };
  },

  route53: (resource) => {
    const logicalId = sanitizeLogicalId(resource.name);
    return {
      [logicalId]: {
        Type: 'AWS::Route53::HostedZone',
        Properties: {
          Name: (resource.config.domainName as string) ?? 'example.com',
        },
      },
    };
  },

  cloudwatch: (resource) => {
    const logicalId = sanitizeLogicalId(resource.name);
    return {
      [logicalId]: {
        Type: 'AWS::CloudWatch::Dashboard',
        Properties: {
          DashboardName: { 'Fn::Sub': `\${NamingPrefix}-${resource.name}` },
          DashboardBody: JSON.stringify({
            widgets: [
              {
                type: 'text',
                x: 0,
                y: 0,
                width: 24,
                height: 2,
                properties: { markdown: '# Architecture Dashboard' },
              },
            ],
          }),
        },
      },
    };
  },

  waf: (resource) => {
    const logicalId = sanitizeLogicalId(resource.name);
    return {
      [logicalId]: {
        Type: 'AWS::WAFv2::WebACL',
        Properties: {
          Name: { 'Fn::Sub': `\${NamingPrefix}-${resource.name}` },
          Scope: (resource.config.scope as string) ?? 'REGIONAL',
          DefaultAction: { Allow: {} },
          VisibilityConfig: {
            SampledRequestsEnabled: true,
            CloudWatchMetricsEnabled: true,
            MetricName: { 'Fn::Sub': `\${NamingPrefix}${logicalId}Metrics` },
          },
          Rules: [
            {
              Name: 'RateLimitRule',
              Priority: 1,
              Action: { Block: {} },
              Statement: {
                RateBasedStatement: {
                  Limit: (resource.config.rateLimit as number) ?? 2000,
                  AggregateKeyType: 'IP',
                },
              },
              VisibilityConfig: {
                SampledRequestsEnabled: true,
                CloudWatchMetricsEnabled: true,
                MetricName: 'RateLimitRule',
              },
            },
          ],
          Tags: [{ Key: 'ManagedBy', Value: 'aws-arch-advisor' }],
        },
      },
    };
  },

  bedrock: (resource) => {
    const logicalId = sanitizeLogicalId(resource.name);
    return {
      [logicalId]: {
        Type: 'AWS::Bedrock::Agent',
        Properties: {
          AgentName: { 'Fn::Sub': `\${NamingPrefix}-${resource.name}` },
          FoundationModel: (resource.config.modelId as string) ?? 'anthropic.claude-3-sonnet-20240229-v1:0',
          Description: resource.config.description ?? `Bedrock agent: ${resource.name}`,
          Tags: { ManagedBy: 'aws-arch-advisor' },
        },
      },
    };
  },

  eventbridge: (resource) => {
    const logicalId = sanitizeLogicalId(resource.name);
    return {
      [logicalId]: {
        Type: 'AWS::Events::EventBus',
        Properties: {
          Name: { 'Fn::Sub': `\${NamingPrefix}-${resource.name}` },
          Tags: [{ Key: 'ManagedBy', Value: 'aws-arch-advisor' }],
        },
      },
    };
  },
};

function generateVpcResources(network: NetworkTopology): Record<string, CfnResource> {
  const resources: Record<string, CfnResource> = {};

  if (!network.vpc) return resources;

  resources.VPC = {
    Type: 'AWS::EC2::VPC',
    Properties: {
      CidrBlock: network.vpc.cidrBlock,
      EnableDnsHostnames: network.vpc.enableDnsHostnames,
      EnableDnsSupport: network.vpc.enableDnsSupport,
      Tags: [
        { Key: 'Name', Value: { 'Fn::Sub': '${NamingPrefix}-vpc' } },
        { Key: 'ManagedBy', Value: 'aws-arch-advisor' },
      ],
    },
  };

  if (network.vpc.internetGateway) {
    resources.InternetGateway = {
      Type: 'AWS::EC2::InternetGateway',
      Properties: {
        Tags: [
          { Key: 'Name', Value: { 'Fn::Sub': '${NamingPrefix}-igw' } },
          { Key: 'ManagedBy', Value: 'aws-arch-advisor' },
        ],
      },
    };

    resources.VPCGatewayAttachment = {
      Type: 'AWS::EC2::VPCGatewayAttachment',
      Properties: {
        VpcId: { Ref: 'VPC' },
        InternetGatewayId: { Ref: 'InternetGateway' },
      },
      DependsOn: 'InternetGateway',
    };
  }

  const publicRouteTableCreated = network.subnets.some((s) => s.type === 'public');
  if (publicRouteTableCreated) {
    resources.PublicRouteTable = {
      Type: 'AWS::EC2::RouteTable',
      Properties: {
        VpcId: { Ref: 'VPC' },
        Tags: [{ Key: 'Name', Value: { 'Fn::Sub': '${NamingPrefix}-public-rt' } }],
      },
    };

    if (network.vpc.internetGateway) {
      resources.PublicRoute = {
        Type: 'AWS::EC2::Route',
        Properties: {
          RouteTableId: { Ref: 'PublicRouteTable' },
          DestinationCidrBlock: '0.0.0.0/0',
          GatewayId: { Ref: 'InternetGateway' },
        },
        DependsOn: 'VPCGatewayAttachment',
      };
    }
  }

  const hasPrivateSubnets = network.subnets.some((s) => s.type === 'private');

  if (hasPrivateSubnets && network.vpc.natGateway?.enabled) {
    resources.NATGatewayEIP = {
      Type: 'AWS::EC2::EIP',
      Properties: { Domain: 'vpc' },
    };

    resources.NATGateway = {
      Type: 'AWS::EC2::NatGateway',
      Properties: {
        AllocationId: { 'Fn::GetAtt': ['NATGatewayEIP', 'AllocationId'] },
        SubnetId: { Ref: sanitizeLogicalId(network.subnets.find((s) => s.type === 'public')?.name ?? 'PublicSubnet') },
        Tags: [{ Key: 'Name', Value: { 'Fn::Sub': '${NamingPrefix}-nat' } }],
      },
    };

    resources.PrivateRouteTable = {
      Type: 'AWS::EC2::RouteTable',
      Properties: {
        VpcId: { Ref: 'VPC' },
        Tags: [{ Key: 'Name', Value: { 'Fn::Sub': '${NamingPrefix}-private-rt' } }],
      },
    };

    resources.PrivateRoute = {
      Type: 'AWS::EC2::Route',
      Properties: {
        RouteTableId: { Ref: 'PrivateRouteTable' },
        DestinationCidrBlock: '0.0.0.0/0',
        NatGatewayId: { Ref: 'NATGateway' },
      },
      DependsOn: 'NATGateway',
    };
  }

  for (const subnet of network.subnets) {
    const subnetLogicalId = sanitizeLogicalId(subnet.name);
    resources[subnetLogicalId] = {
      Type: 'AWS::EC2::Subnet',
      Properties: {
        VpcId: { Ref: 'VPC' },
        CidrBlock: subnet.cidrBlock,
        AvailabilityZone: subnet.availabilityZone,
        MapPublicIpOnLaunch: subnet.type === 'public',
        Tags: [
          { Key: 'Name', Value: { 'Fn::Sub': `\${NamingPrefix}-${subnet.name}` } },
          { Key: 'ManagedBy', Value: 'aws-arch-advisor' },
        ],
      },
    };

    const routeTableRef = subnet.type === 'public' ? 'PublicRouteTable' : 'PrivateRouteTable';
    if (resources[routeTableRef]) {
      resources[`${subnetLogicalId}RouteTableAssoc`] = {
        Type: 'AWS::EC2::SubnetRouteTableAssociation',
        Properties: {
          SubnetId: { Ref: subnetLogicalId },
          RouteTableId: { Ref: routeTableRef },
        },
      };
    }
  }

  return resources;
}

function generateSecurityGroups(securityGroups: SecurityGroup[]): Record<string, CfnResource> {
  const resources: Record<string, CfnResource> = {};

  for (const sg of securityGroups) {
    const logicalId = sanitizeLogicalId(sg.name);
    resources[logicalId] = {
      Type: 'AWS::EC2::SecurityGroup',
      Properties: {
        GroupDescription: sg.description || `Security group: ${sg.name}`,
        VpcId: { Ref: 'VPC' },
        SecurityGroupIngress: sg.ingressRules.map((rule) => ({
          IpProtocol: rule.protocol,
          FromPort: rule.fromPort,
          ToPort: rule.toPort,
          CidrIp: rule.source,
          Description: rule.description,
        })),
        SecurityGroupEgress: sg.egressRules.map((rule) => ({
          IpProtocol: rule.protocol,
          FromPort: rule.fromPort,
          ToPort: rule.toPort,
          CidrIp: rule.source,
          Description: rule.description,
        })),
        Tags: [
          { Key: 'Name', Value: { 'Fn::Sub': `\${NamingPrefix}-${sg.name}` } },
          { Key: 'ManagedBy', Value: 'aws-arch-advisor' },
        ],
      },
    };
  }

  return resources;
}

function generateIamRoles(resources: Resource[]): Record<string, CfnResource> {
  const cfnResources: Record<string, CfnResource> = {};

  for (const resource of resources) {
    if (resource.type !== 'lambda' && resource.type !== 'ecs-fargate') continue;

    const logicalId = sanitizeLogicalId(resource.name);
    const roleName = `${logicalId}ServiceRole`;

    const service =
      resource.type === 'lambda' ? 'lambda.amazonaws.com' : 'ecs-tasks.amazonaws.com';

    const managedPolicy =
      resource.type === 'lambda'
        ? 'arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole'
        : 'arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy';

    cfnResources[roleName] = {
      Type: 'AWS::IAM::Role',
      Properties: {
        RoleName: { 'Fn::Sub': `\${NamingPrefix}-${logicalId}-svc-role` },
        AssumeRolePolicyDocument: {
          Version: '2012-10-17',
          Statement: [
            {
              Effect: 'Allow',
              Principal: { Service: service },
              Action: 'sts:AssumeRole',
            },
          ],
        },
        ManagedPolicyArns: [managedPolicy],
      },
    };
  }

  return cfnResources;
}

function generateOutputs(resources: Resource[]): Record<string, CfnOutput> {
  const outputs: Record<string, CfnOutput> = {};

  for (const resource of resources) {
    const logicalId = sanitizeLogicalId(resource.name);

    switch (resource.type) {
      case 'api-gateway':
        outputs[`${logicalId}Url`] = {
          Description: `URL for API Gateway ${resource.name}`,
          Value: {
            'Fn::Sub': `https://\${${logicalId}}.execute-api.\${AWS::Region}.amazonaws.com/\${Environment}`,
          },
        };
        break;
      case 'lambda':
        outputs[`${logicalId}Arn`] = {
          Description: `ARN for Lambda function ${resource.name}`,
          Value: { 'Fn::GetAtt': [logicalId, 'Arn'] },
        };
        break;
      case 's3':
        outputs[`${logicalId}BucketName`] = {
          Description: `Name of S3 bucket ${resource.name}`,
          Value: { Ref: logicalId },
        };
        break;
      case 'dynamodb':
        outputs[`${logicalId}TableName`] = {
          Description: `Name of DynamoDB table ${resource.name}`,
          Value: { Ref: logicalId },
        };
        break;
      case 'cognito':
        outputs[`${logicalId}UserPoolId`] = {
          Description: `User Pool ID for ${resource.name}`,
          Value: { Ref: logicalId },
        };
        break;
      case 'cloudfront':
        outputs[`${logicalId}DomainName`] = {
          Description: `CloudFront domain for ${resource.name}`,
          Value: { 'Fn::GetAtt': [logicalId, 'DomainName'] },
        };
        break;
    }
  }

  return outputs;
}

export function generateTemplate(architecture: ArchitectureModel): CfnTemplate {
  const cfnResources: Record<string, CfnResource> = {};

  Object.assign(cfnResources, generateVpcResources(architecture.network));
  Object.assign(cfnResources, generateSecurityGroups(architecture.securityGroups));

  for (const resource of architecture.resources) {
    const mapper = SERVICE_MAPPERS[resource.type];
    if (mapper) {
      Object.assign(cfnResources, mapper(resource, architecture));
    }
  }

  return {
    AWSTemplateFormatVersion: '2010-09-09',
    Description: `CloudFormation template for ${architecture.metadata.name} — generated by AWS Architecture Advisor`,
    Parameters: {
      Environment: {
        Type: 'String',
        Default: 'dev',
        AllowedValues: ['dev', 'staging', 'prod'],
        Description: 'Deployment environment',
      },
      NamingPrefix: {
        Type: 'String',
        Default: architecture.metadata.namingPrefix,
        Description: 'Prefix for all resource names',
      },
    },
    Resources: cfnResources,
    Outputs: generateOutputs(architecture.resources),
  };
}
