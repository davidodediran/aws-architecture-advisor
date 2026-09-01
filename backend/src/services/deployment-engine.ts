import {
  STSClient,
  AssumeRoleCommand,
} from '@aws-sdk/client-sts';
import {
  CloudFormationClient,
  CreateStackCommand,
  UpdateStackCommand,
  DeleteStackCommand,
  DescribeStacksCommand,
  DescribeStackEventsCommand,
} from '@aws-sdk/client-cloudformation';
import type { Tag } from '@aws-sdk/client-cloudformation';

const stsClient = new STSClient({});

interface DeployParams {
  templateBody: string;
  stackName: string;
  roleArn: string;
  externalId: string;
  namingPrefix: string;
  projectId: string;
  userId: string;
}

interface AssumedCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken: string;
  expiration?: Date;
}

interface StackStatus {
  status: string;
  outputs: Record<string, string>;
  events: StackEvent[];
}

interface StackEvent {
  timestamp: string;
  logicalResourceId: string;
  resourceStatus: string;
  resourceStatusReason?: string;
}

interface DeployResult {
  stackId: string;
  stackName: string;
  status: string;
}

function buildSessionPolicy(templateBody: string, namingPrefix: string): string {
  const resourceTypes = new Set<string>();
  try {
    const template = JSON.parse(templateBody);
    for (const resource of Object.values(template.Resources ?? {})) {
      const type = (resource as { Type?: string }).Type;
      if (type) resourceTypes.add(type);
    }
  } catch {
    // fall through with empty set
  }

  const serviceActions: string[] = [
    'cloudformation:*',
  ];

  const serviceMap: Record<string, string[]> = {
    'AWS::Lambda::Function': ['lambda:*'],
    'AWS::IAM::Role': ['iam:CreateRole', 'iam:DeleteRole', 'iam:AttachRolePolicy', 'iam:DetachRolePolicy', 'iam:PutRolePolicy', 'iam:DeleteRolePolicy', 'iam:GetRole', 'iam:PassRole', 'iam:TagRole'],
    'AWS::DynamoDB::Table': ['dynamodb:*'],
    'AWS::S3::Bucket': ['s3:*'],
    'AWS::RDS::DBCluster': ['rds:*'],
    'AWS::ApiGateway::RestApi': ['apigateway:*'],
    'AWS::CloudFront::Distribution': ['cloudfront:*'],
    'AWS::Cognito::UserPool': ['cognito-idp:*'],
    'AWS::SQS::Queue': ['sqs:*'],
    'AWS::SNS::Topic': ['sns:*'],
    'AWS::StepFunctions::StateMachine': ['states:*'],
    'AWS::Events::EventBus': ['events:*'],
    'AWS::Kinesis::Stream': ['kinesis:*'],
    'AWS::OpenSearchService::Domain': ['es:*'],
    'AWS::EC2::VPC': ['ec2:*'],
    'AWS::EC2::Subnet': ['ec2:*'],
    'AWS::EC2::SecurityGroup': ['ec2:*'],
    'AWS::EC2::Instance': ['ec2:*'],
    'AWS::EC2::InternetGateway': ['ec2:*'],
    'AWS::EC2::NatGateway': ['ec2:*'],
    'AWS::EC2::RouteTable': ['ec2:*'],
    'AWS::EC2::Route': ['ec2:*'],
    'AWS::ElastiCache::CacheCluster': ['elasticache:*'],
    'AWS::ECS::Cluster': ['ecs:*'],
    'AWS::ECS::Service': ['ecs:*'],
    'AWS::ECS::TaskDefinition': ['ecs:*'],
    'AWS::CloudWatch::Dashboard': ['cloudwatch:*'],
    'AWS::CloudWatch::Alarm': ['cloudwatch:*'],
    'AWS::WAFv2::WebACL': ['wafv2:*'],
    'AWS::Route53::HostedZone': ['route53:*'],
    'AWS::Bedrock::Agent': ['bedrock:*'],
    'AWS::Logs::LogGroup': ['logs:*'],
  };

  for (const resourceType of resourceTypes) {
    const actions = serviceMap[resourceType];
    if (actions) {
      for (const action of actions) {
        if (!serviceActions.includes(action)) {
          serviceActions.push(action);
        }
      }
    }
  }

  return JSON.stringify({
    Version: '2012-10-17',
    Statement: [
      {
        Effect: 'Allow',
        Action: serviceActions,
        Resource: '*',
        Condition: {
          StringLike: {
            'aws:RequestTag/NamingPrefix': namingPrefix,
          },
        },
      },
      {
        Effect: 'Allow',
        Action: serviceActions,
        Resource: `*`,
        Condition: {
          StringLike: {
            'aws:ResourceTag/ManagedBy': 'aws-arch-advisor',
          },
        },
      },
      {
        Effect: 'Allow',
        Action: [
          'cloudformation:CreateStack',
          'cloudformation:UpdateStack',
          'cloudformation:DeleteStack',
          'cloudformation:DescribeStacks',
          'cloudformation:DescribeStackEvents',
          'cloudformation:GetTemplate',
          'cloudformation:ListStackResources',
        ],
        Resource: { 'Fn::Sub': `arn:aws:cloudformation:*:*:stack/${namingPrefix}-*` },
      },
    ],
  });
}

async function assumeStudentRole(
  roleArn: string,
  externalId: string,
  namingPrefix: string,
  templateBody: string,
): Promise<AssumedCredentials> {
  const sessionPolicy = buildSessionPolicy(templateBody, namingPrefix);

  const response = await stsClient.send(
    new AssumeRoleCommand({
      RoleArn: roleArn,
      RoleSessionName: `aws-arch-advisor-${namingPrefix}-${Date.now()}`.slice(0, 64),
      ExternalId: externalId,
      DurationSeconds: 3600,
      Policy: sessionPolicy,
    }),
  );

  if (!response.Credentials) {
    throw new Error('STS AssumeRole did not return credentials');
  }

  return {
    accessKeyId: response.Credentials.AccessKeyId!,
    secretAccessKey: response.Credentials.SecretAccessKey!,
    sessionToken: response.Credentials.SessionToken!,
    expiration: response.Credentials.Expiration,
  };
}

function createCfnClient(credentials: AssumedCredentials): CloudFormationClient {
  return new CloudFormationClient({
    credentials: {
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
      sessionToken: credentials.sessionToken,
    },
  });
}

function buildStackTags(params: DeployParams): Tag[] {
  return [
    { Key: 'ManagedBy', Value: 'aws-arch-advisor' },
    { Key: 'ProjectId', Value: params.projectId },
    { Key: 'NamingPrefix', Value: params.namingPrefix },
    { Key: 'CreatedBy', Value: params.userId },
  ];
}

export async function deployStack(params: DeployParams): Promise<DeployResult> {
  const credentials = await assumeStudentRole(
    params.roleArn,
    params.externalId,
    params.namingPrefix,
    params.templateBody,
  );

  const cfnClient = createCfnClient(credentials);
  const tags = buildStackTags(params);

  try {
    const updateResult = await cfnClient.send(
      new UpdateStackCommand({
        StackName: params.stackName,
        TemplateBody: params.templateBody,
        Tags: tags,
        Capabilities: ['CAPABILITY_NAMED_IAM', 'CAPABILITY_AUTO_EXPAND'],
        Parameters: [
          { ParameterKey: 'NamingPrefix', ParameterValue: params.namingPrefix },
        ],
      }),
    );

    return {
      stackId: updateResult.StackId ?? params.stackName,
      stackName: params.stackName,
      status: 'UPDATE_IN_PROGRESS',
    };
  } catch (err) {
    const error = err as { name?: string; message?: string };

    if (
      error.message?.includes('does not exist') ||
      error.name === 'ValidationError'
    ) {
      try {
        const createResult = await cfnClient.send(
          new CreateStackCommand({
            StackName: params.stackName,
            TemplateBody: params.templateBody,
            Tags: tags,
            Capabilities: ['CAPABILITY_NAMED_IAM', 'CAPABILITY_AUTO_EXPAND'],
            Parameters: [
              { ParameterKey: 'NamingPrefix', ParameterValue: params.namingPrefix },
            ],
            OnFailure: 'ROLLBACK',
            TimeoutInMinutes: 30,
          }),
        );

        return {
          stackId: createResult.StackId ?? params.stackName,
          stackName: params.stackName,
          status: 'CREATE_IN_PROGRESS',
        };
      } catch (createErr) {
        const createError = createErr as { message?: string };
        throw new Error(`Failed to create stack: ${createError.message}`);
      }
    }

    if (error.message?.includes('No updates are to be performed')) {
      return {
        stackId: params.stackName,
        stackName: params.stackName,
        status: 'UPDATE_COMPLETE_NO_CHANGES',
      };
    }

    throw new Error(`Failed to update stack: ${error.message}`);
  }
}

export async function getStackStatus(
  stackName: string,
  roleArn: string,
  externalId: string,
): Promise<StackStatus> {
  const credentials = await assumeStudentRole(roleArn, externalId, stackName, '{}');
  const cfnClient = createCfnClient(credentials);

  const describeResult = await cfnClient.send(
    new DescribeStacksCommand({ StackName: stackName }),
  );

  const stack = describeResult.Stacks?.[0];
  if (!stack) {
    throw new Error(`Stack "${stackName}" not found`);
  }

  const outputs: Record<string, string> = {};
  for (const output of stack.Outputs ?? []) {
    if (output.OutputKey && output.OutputValue) {
      outputs[output.OutputKey] = output.OutputValue;
    }
  }

  const eventsResult = await cfnClient.send(
    new DescribeStackEventsCommand({ StackName: stackName }),
  );

  const events: StackEvent[] = (eventsResult.StackEvents ?? []).slice(0, 20).map((e) => ({
    timestamp: e.Timestamp?.toISOString() ?? '',
    logicalResourceId: e.LogicalResourceId ?? '',
    resourceStatus: e.ResourceStatus ?? '',
    resourceStatusReason: e.ResourceStatusReason,
  }));

  return {
    status: stack.StackStatus ?? 'UNKNOWN',
    outputs,
    events,
  };
}

export async function deleteDeployedStack(
  stackName: string,
  roleArn: string,
  externalId: string,
): Promise<void> {
  const credentials = await assumeStudentRole(roleArn, externalId, stackName, '{}');
  const cfnClient = createCfnClient(credentials);

  await cfnClient.send(new DeleteStackCommand({ StackName: stackName }));
}
