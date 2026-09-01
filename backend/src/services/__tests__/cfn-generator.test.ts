import { describe, it, expect } from 'vitest';
import type { ArchitectureModel, Resource } from '@aws-arch-advisor/shared';

interface CfnTemplate {
  AWSTemplateFormatVersion: string;
  Description: string;
  Parameters: Record<string, unknown>;
  Resources: Record<string, { Type: string; Properties: Record<string, unknown> }>;
  Outputs: Record<string, unknown>;
}

function generateTemplate(architecture: ArchitectureModel): CfnTemplate {
  const resources: CfnTemplate['Resources'] = {};
  const outputs: CfnTemplate['Outputs'] = {};

  for (const resource of architecture.resources) {
    switch (resource.type) {
      case 'lambda': {
        resources[resource.logicalId] = {
          Type: 'AWS::Lambda::Function',
          Properties: {
            FunctionName: `${architecture.metadata.namingPrefix}-${resource.name}`,
            Runtime: (resource.config.runtime as string) ?? 'nodejs20.x',
            Handler: 'index.handler',
            MemorySize: (resource.config.memorySize as number) ?? 256,
            Timeout: (resource.config.timeout as number) ?? 30,
            Architectures: ['arm64'],
          },
        };
        outputs[`${resource.logicalId}Arn`] = {
          Description: `ARN of ${resource.name}`,
          Value: { 'Fn::GetAtt': [resource.logicalId, 'Arn'] },
        };
        break;
      }

      case 'dynamodb': {
        resources[resource.logicalId] = {
          Type: 'AWS::DynamoDB::Table',
          Properties: {
            TableName: `${architecture.metadata.namingPrefix}-${resource.name}`,
            BillingMode: (resource.config.billingMode as string) ?? 'PAY_PER_REQUEST',
            AttributeDefinitions: [{ AttributeName: 'pk', AttributeType: 'S' }, { AttributeName: 'sk', AttributeType: 'S' }],
            KeySchema: [{ AttributeName: 'pk', KeyType: 'HASH' }, { AttributeName: 'sk', KeyType: 'RANGE' }],
          },
        };
        break;
      }

      case 'api-gateway': {
        resources[resource.logicalId] = {
          Type: 'AWS::ApiGateway::RestApi',
          Properties: {
            Name: `${architecture.metadata.namingPrefix}-${resource.name}`,
            Description: resource.name,
          },
        };
        outputs[`${resource.logicalId}Url`] = {
          Description: `URL of ${resource.name}`,
          Value: { 'Fn::Sub': `https://\${${resource.logicalId}}.execute-api.\${AWS::Region}.amazonaws.com/prod` },
        };
        break;
      }

      case 's3': {
        resources[resource.logicalId] = {
          Type: 'AWS::S3::Bucket',
          Properties: {
            BucketName: { 'Fn::Sub': `${architecture.metadata.namingPrefix}-${resource.name.toLowerCase().replace(/\s+/g, '-')}-\${AWS::AccountId}` },
            PublicAccessBlockConfiguration: {
              BlockPublicAcls: true,
              BlockPublicPolicy: true,
              IgnorePublicAcls: true,
              RestrictPublicBuckets: true,
            },
            BucketEncryption: {
              ServerSideEncryptionConfiguration: [{
                ServerSideEncryptionByDefault: { SSEAlgorithm: 'AES256' },
              }],
            },
          },
        };
        outputs[`${resource.logicalId}Name`] = {
          Description: `Name of ${resource.name} bucket`,
          Value: { Ref: resource.logicalId },
        };
        break;
      }

      case 'cloudfront':
      case 'cognito':
      case 'sqs':
      case 'sns':
      case 'eventbridge':
      case 'cloudwatch':
      case 'waf': {
        const typeMap: Record<string, string> = {
          cloudfront: 'AWS::CloudFront::Distribution',
          cognito: 'AWS::Cognito::UserPool',
          sqs: 'AWS::SQS::Queue',
          sns: 'AWS::SNS::Topic',
          eventbridge: 'AWS::Events::EventBus',
          cloudwatch: 'AWS::CloudWatch::Dashboard',
          waf: 'AWS::WAFv2::WebACL',
        };
        resources[resource.logicalId] = {
          Type: typeMap[resource.type],
          Properties: { ...resource.config },
        };
        break;
      }

      default: {
        resources[resource.logicalId] = {
          Type: `AWS::Custom::${resource.type}`,
          Properties: { ...resource.config },
        };
      }
    }
  }

  if (architecture.network.vpc) {
    resources['VPC'] = {
      Type: 'AWS::EC2::VPC',
      Properties: {
        CidrBlock: architecture.network.vpc.cidrBlock,
        EnableDnsHostnames: architecture.network.vpc.enableDnsHostnames,
        EnableDnsSupport: architecture.network.vpc.enableDnsSupport,
      },
    };
    if (architecture.network.vpc.internetGateway) {
      resources['InternetGateway'] = {
        Type: 'AWS::EC2::InternetGateway',
        Properties: {},
      };
    }
  }

  for (const subnet of architecture.network.subnets) {
    resources[`Subnet${subnet.id}`] = {
      Type: 'AWS::EC2::Subnet',
      Properties: {
        VpcId: { Ref: 'VPC' },
        CidrBlock: subnet.cidrBlock,
        AvailabilityZone: subnet.availabilityZone,
      },
    };
  }

  for (const sg of architecture.securityGroups) {
    resources[`SG${sg.id}`] = {
      Type: 'AWS::EC2::SecurityGroup',
      Properties: {
        GroupDescription: sg.description,
        VpcId: { Ref: 'VPC' },
        SecurityGroupIngress: sg.ingressRules.map((r) => ({
          IpProtocol: r.protocol,
          FromPort: r.fromPort,
          ToPort: r.toPort,
          CidrIp: r.source,
          Description: r.description,
        })),
        SecurityGroupEgress: sg.egressRules.map((r) => ({
          IpProtocol: r.protocol,
          FromPort: r.fromPort,
          ToPort: r.toPort,
          CidrIp: r.source,
          Description: r.description,
        })),
      },
    };
  }

  return {
    AWSTemplateFormatVersion: '2010-09-09',
    Description: `CloudFormation template for ${architecture.metadata.name}`,
    Parameters: {
      Environment: {
        Type: 'String',
        Default: 'dev',
        AllowedValues: ['dev', 'staging', 'prod'],
      },
    },
    Resources: resources,
    Outputs: outputs,
  };
}

function makeArchitecture(resources: Resource[], overrides?: Partial<ArchitectureModel>): ArchitectureModel {
  return {
    schemaVersion: '1.0',
    metadata: {
      projectId: 'test',
      userId: 'user1',
      name: 'Test Project',
      description: 'Test architecture',
      region: 'us-east-1',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 1,
      cleanupLambdaEnabled: false,
      namingPrefix: 'test',
    },
    network: overrides?.network ?? { subnets: [], availabilityZones: [], publicAccess: [] },
    resources,
    connections: overrides?.connections ?? [],
    securityGroups: overrides?.securityGroups ?? [],
    iamRoles: overrides?.iamRoles ?? [],
    tags: overrides?.tags ?? {},
  };
}

describe('generateTemplate', () => {
  it('generates Lambda and DynamoDB resources', () => {
    const arch = makeArchitecture([
      { id: 'fn-1', type: 'lambda', name: 'MyFunction', logicalId: 'MyFunction', config: { runtime: 'nodejs20.x' } },
      { id: 'db-1', type: 'dynamodb', name: 'MyTable', logicalId: 'MyTable', config: { billingMode: 'PAY_PER_REQUEST' } },
    ]);

    const template = generateTemplate(arch);
    expect(template.Resources['MyFunction']).toBeDefined();
    expect(template.Resources['MyFunction'].Type).toBe('AWS::Lambda::Function');
    expect(template.Resources['MyTable']).toBeDefined();
    expect(template.Resources['MyTable'].Type).toBe('AWS::DynamoDB::Table');
  });

  it('generates VPC resources when VPC is configured', () => {
    const arch = makeArchitecture(
      [{ id: 'fn-1', type: 'lambda', name: 'Fn', logicalId: 'Fn', config: {} }],
      {
        network: {
          vpc: {
            cidrBlock: '10.0.0.0/16',
            enableDnsHostnames: true,
            enableDnsSupport: true,
            internetGateway: true,
            natGateway: { enabled: false, type: 'single' },
          },
          subnets: [
            { id: 'pub1', name: 'Public-1', type: 'public', cidrBlock: '10.0.1.0/24', availabilityZone: 'us-east-1a' },
          ],
          availabilityZones: ['us-east-1a'],
          publicAccess: [],
        },
      },
    );

    const template = generateTemplate(arch);
    expect(template.Resources['VPC']).toBeDefined();
    expect(template.Resources['VPC'].Type).toBe('AWS::EC2::VPC');
    expect(template.Resources['InternetGateway']).toBeDefined();
    expect(template.Resources['Subnetpub1']).toBeDefined();
    expect(template.Resources['Subnetpub1'].Type).toBe('AWS::EC2::Subnet');
  });

  it('generates security groups', () => {
    const arch = makeArchitecture(
      [{ id: 'fn-1', type: 'lambda', name: 'Fn', logicalId: 'Fn', config: {} }],
      {
        network: {
          vpc: {
            cidrBlock: '10.0.0.0/16',
            enableDnsHostnames: true,
            enableDnsSupport: true,
            internetGateway: false,
            natGateway: { enabled: false, type: 'single' },
          },
          subnets: [],
          availabilityZones: [],
          publicAccess: [],
        },
        securityGroups: [
          {
            id: 'sg1',
            name: 'WebSG',
            description: 'Web security group',
            ingressRules: [
              { protocol: 'tcp', fromPort: 443, toPort: 443, source: '0.0.0.0/0', description: 'HTTPS' },
            ],
            egressRules: [
              { protocol: '-1', fromPort: 0, toPort: 65535, source: '0.0.0.0/0', description: 'All outbound' },
            ],
          },
        ],
      },
    );

    const template = generateTemplate(arch);
    expect(template.Resources['SGsg1']).toBeDefined();
    expect(template.Resources['SGsg1'].Type).toBe('AWS::EC2::SecurityGroup');
    expect(template.Resources['SGsg1'].Properties.SecurityGroupIngress).toHaveLength(1);
  });

  it('includes Parameters section', () => {
    const arch = makeArchitecture([
      { id: 'fn-1', type: 'lambda', name: 'Fn', logicalId: 'Fn', config: {} },
    ]);

    const template = generateTemplate(arch);
    expect(template.Parameters).toBeDefined();
    expect(template.Parameters.Environment).toBeDefined();
  });

  it('generates Outputs for API Gateway, Lambda, and S3', () => {
    const arch = makeArchitecture([
      { id: 'apigw-1', type: 'api-gateway', name: 'API', logicalId: 'ApiGw', config: {} },
      { id: 'fn-1', type: 'lambda', name: 'Handler', logicalId: 'HandlerFn', config: {} },
      { id: 's3-1', type: 's3', name: 'Bucket', logicalId: 'AppBucket', config: {} },
    ]);

    const template = generateTemplate(arch);
    expect(template.Outputs['ApiGwUrl']).toBeDefined();
    expect(template.Outputs['HandlerFnArn']).toBeDefined();
    expect(template.Outputs['AppBucketName']).toBeDefined();
  });
});
