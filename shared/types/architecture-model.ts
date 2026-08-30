export interface ArchitectureModel {
  schemaVersion: '1.0';
  metadata: ModelMetadata;
  network: NetworkTopology;
  resources: Resource[];
  connections: Connection[];
  securityGroups: SecurityGroup[];
  iamRoles: IamRole[];
  tags: Record<string, string>;
}

export interface ModelMetadata {
  projectId: string;
  userId: string;
  name: string;
  description: string;
  region: AwsRegion;
  createdAt: string;
  updatedAt: string;
  version: number;
  templateId?: string;
  cleanupLambdaEnabled: boolean;
  namingPrefix: string;
}

export interface NetworkTopology {
  vpc?: VpcConfig;
  subnets: Subnet[];
  availabilityZones: string[];
  publicAccess: PublicAccessPoint[];
}

export interface VpcConfig {
  cidrBlock: string;
  enableDnsHostnames: boolean;
  enableDnsSupport: boolean;
  internetGateway: boolean;
  natGateway: NatGatewayConfig;
}

export interface NatGatewayConfig {
  enabled: boolean;
  type: 'single' | 'per-az';
}

export interface Subnet {
  id: string;
  name: string;
  type: 'public' | 'private' | 'isolated';
  cidrBlock: string;
  availabilityZone: string;
}

export interface PublicAccessPoint {
  resourceId: string;
  type: 'api-gateway' | 'cloudfront' | 'alb' | 'nlb';
  customDomain?: string;
}

export interface Resource {
  id: string;
  type: ServiceType;
  name: string;
  logicalId: string;
  config: ResourceConfig;
  subnet?: string;
  position?: DiagramPosition;
  costEstimate?: CostEstimate;
}

export interface ResourceConfig {
  [key: string]: unknown;
}

export interface DiagramPosition {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CostEstimate {
  monthlyUsd: number;
  breakdown: CostBreakdownItem[];
  assumptions: string[];
}

export interface CostBreakdownItem {
  dimension: string;
  quantity: number;
  unit: string;
  unitPriceUsd: number;
  monthlyUsd: number;
}

export interface Connection {
  id: string;
  sourceId: string;
  targetId: string;
  type: ConnectionType;
  label?: string;
  protocol?: string;
  port?: number;
}

export type ConnectionType = 'data-flow' | 'network' | 'trigger' | 'dependency' | 'iam';

export interface SecurityGroup {
  id: string;
  name: string;
  description: string;
  ingressRules: SecurityGroupRule[];
  egressRules: SecurityGroupRule[];
}

export interface SecurityGroupRule {
  protocol: 'tcp' | 'udp' | 'icmp' | '-1';
  fromPort: number;
  toPort: number;
  source: string;
  description: string;
}

export interface IamRole {
  id: string;
  name: string;
  resourceId: string;
  policies: IamPolicy[];
}

export interface IamPolicy {
  effect: 'Allow' | 'Deny';
  actions: string[];
  resources: string[];
  conditions?: Record<string, Record<string, string>>;
}

export type ServiceType =
  | 'lambda' | 'api-gateway' | 'api-gateway-websocket' | 'dynamodb' | 's3'
  | 'cloudfront' | 'cognito' | 'sqs' | 'sns' | 'step-functions' | 'eventbridge'
  | 'kinesis' | 'rds-aurora-serverless' | 'elasticache' | 'ecs-fargate' | 'ecr'
  | 'cloudwatch' | 'cloudtrail' | 'waf' | 'secrets-manager' | 'kms';

export type AwsRegion =
  | 'us-east-1' | 'us-west-2' | 'eu-west-1' | 'eu-central-1'
  | 'ap-southeast-1' | 'ap-northeast-1';
