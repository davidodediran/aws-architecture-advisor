import type { ServiceType } from '../types/architecture-model';

export type ServiceCategory = 'compute' | 'storage' | 'database' | 'networking' | 'security' | 'messaging' | 'integration' | 'monitoring' | 'ml' | 'containers';

export interface PricingDimension {
  name: string;
  unit: string;
  description: string;
}

export interface ServiceDefinition {
  type: ServiceType;
  displayName: string;
  category: ServiceCategory;
  description: string;
  iconKey: string;
  defaultConfig: Record<string, unknown>;
  cfnResourceType: string;
  pricingDimensions: PricingDimension[];
  waConsiderations: string[];
}

export const SERVICE_CATALOG: Record<ServiceType, ServiceDefinition> = {
  'lambda': {
    type: 'lambda',
    displayName: 'AWS Lambda',
    category: 'compute',
    description: 'Serverless compute service that runs code in response to events',
    iconKey: 'Arch_AWS-Lambda_64',
    defaultConfig: { runtime: 'nodejs20.x', architecture: 'arm64', memorySize: 256, timeout: 30 },
    cfnResourceType: 'AWS::Lambda::Function',
    pricingDimensions: [
      { name: 'requests', unit: 'requests', description: 'Number of requests' },
      { name: 'duration', unit: 'GB-seconds', description: 'Compute time in GB-seconds' },
    ],
    waConsiderations: ['Set appropriate memory size and timeout', 'Use ARM64 for cost savings', 'Enable X-Ray tracing', 'Use reserved concurrency for critical functions'],
  },
  'api-gateway': {
    type: 'api-gateway',
    displayName: 'Amazon API Gateway (REST)',
    category: 'networking',
    description: 'Fully managed REST API service with throttling, caching, and authorization',
    iconKey: 'Arch_Amazon-API-Gateway_64',
    defaultConfig: { type: 'REST', stageName: 'prod', throttlingRateLimit: 1000, throttlingBurstLimit: 500 },
    cfnResourceType: 'AWS::ApiGateway::RestApi',
    pricingDimensions: [
      { name: 'requests', unit: 'requests', description: 'API calls received' },
      { name: 'dataTransfer', unit: 'GB', description: 'Data transfer out' },
    ],
    waConsiderations: ['Enable CloudWatch logging', 'Set up usage plans and API keys', 'Use WAF for protection', 'Enable request validation'],
  },
  'api-gateway-websocket': {
    type: 'api-gateway-websocket',
    displayName: 'Amazon API Gateway (WebSocket)',
    category: 'networking',
    description: 'Managed WebSocket API for real-time two-way communication',
    iconKey: 'Arch_Amazon-API-Gateway_64',
    defaultConfig: { routeSelectionExpression: '$request.body.action' },
    cfnResourceType: 'AWS::ApiGatewayV2::Api',
    pricingDimensions: [
      { name: 'messages', unit: 'messages', description: 'Messages sent and received' },
      { name: 'connectionMinutes', unit: 'minutes', description: 'Connection duration' },
    ],
    waConsiderations: ['Implement connection and idle timeouts', 'Use $connect route for auth', 'Monitor connection counts'],
  },
  'dynamodb': {
    type: 'dynamodb',
    displayName: 'Amazon DynamoDB',
    category: 'database',
    description: 'Fully managed NoSQL database with single-digit millisecond performance',
    iconKey: 'Arch_Amazon-DynamoDB_64',
    defaultConfig: { billingMode: 'PAY_PER_REQUEST', pointInTimeRecovery: true, encryption: 'AWS_OWNED_KMS' },
    cfnResourceType: 'AWS::DynamoDB::Table',
    pricingDimensions: [
      { name: 'readUnits', unit: 'RRU', description: 'Read request units' },
      { name: 'writeUnits', unit: 'WRU', description: 'Write request units' },
      { name: 'storage', unit: 'GB-month', description: 'Data storage' },
    ],
    waConsiderations: ['Enable point-in-time recovery', 'Use on-demand for unpredictable workloads', 'Design partition keys to avoid hot partitions', 'Enable encryption at rest'],
  },
  's3': {
    type: 's3',
    displayName: 'Amazon S3',
    category: 'storage',
    description: 'Object storage with industry-leading scalability and durability',
    iconKey: 'Arch_Amazon-Simple-Storage-Service_64',
    defaultConfig: { blockPublicAccess: true, versioning: true, encryption: 'AES256', intelligentTiering: false },
    cfnResourceType: 'AWS::S3::Bucket',
    pricingDimensions: [
      { name: 'storage', unit: 'GB-month', description: 'Storage used' },
      { name: 'requests', unit: 'requests', description: 'PUT, GET, LIST requests' },
      { name: 'dataTransfer', unit: 'GB', description: 'Data transfer out' },
    ],
    waConsiderations: ['Enable Block Public Access (all four settings)', 'Enable versioning for critical data', 'Use lifecycle policies', 'Enable server-side encryption'],
  },
  'cloudfront': {
    type: 'cloudfront',
    displayName: 'Amazon CloudFront',
    category: 'networking',
    description: 'Global content delivery network for low-latency distribution',
    iconKey: 'Arch_Amazon-CloudFront_64',
    defaultConfig: { priceClass: 'PriceClass_100', httpVersion: 'http2and3', minimumProtocolVersion: 'TLSv1.2_2021' },
    cfnResourceType: 'AWS::CloudFront::Distribution',
    pricingDimensions: [
      { name: 'dataTransfer', unit: 'GB', description: 'Data transfer out to internet' },
      { name: 'requests', unit: 'requests', description: 'HTTP/HTTPS requests' },
    ],
    waConsiderations: ['Use Origin Access Control for S3', 'Enable HTTPS only', 'Set appropriate cache policies', 'Use WAF integration'],
  },
  'cognito': {
    type: 'cognito',
    displayName: 'Amazon Cognito',
    category: 'security',
    description: 'User authentication and authorization service',
    iconKey: 'Arch_Amazon-Cognito_64',
    defaultConfig: { mfa: 'OPTIONAL', passwordPolicy: { minimumLength: 12, requireUppercase: true, requireNumbers: true, requireSymbols: true } },
    cfnResourceType: 'AWS::Cognito::UserPool',
    pricingDimensions: [
      { name: 'mau', unit: 'users', description: 'Monthly active users' },
    ],
    waConsiderations: ['Enable MFA', 'Set strong password policies', 'Use groups for role-based access', 'Configure account recovery'],
  },
  'sqs': {
    type: 'sqs',
    displayName: 'Amazon SQS',
    category: 'messaging',
    description: 'Fully managed message queuing service for decoupling components',
    iconKey: 'Arch_Amazon-Simple-Queue-Service_64',
    defaultConfig: { fifoQueue: false, visibilityTimeout: 30, messageRetentionPeriod: 345600, deadLetterQueue: true },
    cfnResourceType: 'AWS::SQS::Queue',
    pricingDimensions: [
      { name: 'requests', unit: 'requests', description: 'API requests (send, receive, delete)' },
    ],
    waConsiderations: ['Configure dead-letter queues', 'Set appropriate visibility timeout', 'Use FIFO queues for ordering guarantees', 'Enable server-side encryption'],
  },
  'sns': {
    type: 'sns',
    displayName: 'Amazon SNS',
    category: 'messaging',
    description: 'Pub/sub messaging service for event-driven architectures',
    iconKey: 'Arch_Amazon-Simple-Notification-Service_64',
    defaultConfig: { encryption: true },
    cfnResourceType: 'AWS::SNS::Topic',
    pricingDimensions: [
      { name: 'publishes', unit: 'requests', description: 'Publish requests' },
      { name: 'deliveries', unit: 'deliveries', description: 'Notification deliveries' },
    ],
    waConsiderations: ['Enable server-side encryption', 'Use message filtering to reduce costs', 'Configure delivery retry policies'],
  },
  'step-functions': {
    type: 'step-functions',
    displayName: 'AWS Step Functions',
    category: 'integration',
    description: 'Serverless workflow orchestration service',
    iconKey: 'Arch_AWS-Step-Functions_64',
    defaultConfig: { type: 'EXPRESS', logging: true },
    cfnResourceType: 'AWS::StepFunctions::StateMachine',
    pricingDimensions: [
      { name: 'stateTransitions', unit: 'transitions', description: 'State transitions (Standard)' },
      { name: 'requests', unit: 'requests', description: 'Workflow requests (Express)' },
    ],
    waConsiderations: ['Use Express workflows for high-volume short-duration', 'Enable CloudWatch logging', 'Implement error handling and retries in state machine'],
  },
  'eventbridge': {
    type: 'eventbridge',
    displayName: 'Amazon EventBridge',
    category: 'integration',
    description: 'Serverless event bus for event-driven architectures',
    iconKey: 'Arch_Amazon-EventBridge_64',
    defaultConfig: { archiveEnabled: false },
    cfnResourceType: 'AWS::Events::EventBus',
    pricingDimensions: [
      { name: 'events', unit: 'events', description: 'Events published' },
    ],
    waConsiderations: ['Use event archive for replay capability', 'Define schemas for event validation', 'Use DLQ for failed event delivery'],
  },
  'kinesis': {
    type: 'kinesis',
    displayName: 'Amazon Kinesis Data Streams',
    category: 'messaging',
    description: 'Real-time data streaming service for high-throughput ingestion',
    iconKey: 'Arch_Amazon-Kinesis_64',
    defaultConfig: { streamMode: 'ON_DEMAND', retentionPeriod: 24 },
    cfnResourceType: 'AWS::Kinesis::Stream',
    pricingDimensions: [
      { name: 'shardHours', unit: 'shard-hours', description: 'Shard hours (provisioned)' },
      { name: 'dataIngested', unit: 'GB', description: 'Data ingested' },
      { name: 'dataRetrieved', unit: 'GB', description: 'Data retrieved (enhanced fan-out)' },
    ],
    waConsiderations: ['Use on-demand mode for variable throughput', 'Enable server-side encryption', 'Monitor iterator age for consumer lag'],
  },
  'rds-aurora-serverless': {
    type: 'rds-aurora-serverless',
    displayName: 'Amazon Aurora Serverless v2',
    category: 'database',
    description: 'Auto-scaling relational database compatible with MySQL and PostgreSQL',
    iconKey: 'Arch_Amazon-Aurora_64',
    defaultConfig: { engine: 'aurora-postgresql', minCapacity: 0.5, maxCapacity: 4, enableDataApi: true, deletionProtection: true },
    cfnResourceType: 'AWS::RDS::DBCluster',
    pricingDimensions: [
      { name: 'acuHours', unit: 'ACU-hours', description: 'Aurora Capacity Units consumed' },
      { name: 'storage', unit: 'GB-month', description: 'Storage used' },
      { name: 'io', unit: 'requests', description: 'I/O operations' },
    ],
    waConsiderations: ['Enable deletion protection', 'Configure backup retention', 'Use Data API for serverless access', 'Place in private subnets'],
  },
  'elasticache': {
    type: 'elasticache',
    displayName: 'Amazon ElastiCache',
    category: 'database',
    description: 'In-memory caching service supporting Redis and Memcached',
    iconKey: 'Arch_Amazon-ElastiCache_64',
    defaultConfig: { engine: 'redis', nodeType: 'cache.t4g.micro', numNodes: 1, transitEncryption: true },
    cfnResourceType: 'AWS::ElastiCache::CacheCluster',
    pricingDimensions: [
      { name: 'nodeHours', unit: 'node-hours', description: 'Cache node running hours' },
    ],
    waConsiderations: ['Enable encryption in transit and at rest', 'Place in private subnets', 'Use Redis AUTH for access control', 'Configure automatic failover for multi-AZ'],
  },
  'ecs-fargate': {
    type: 'ecs-fargate',
    displayName: 'Amazon ECS on Fargate',
    category: 'containers',
    description: 'Serverless container orchestration without managing infrastructure',
    iconKey: 'Arch_Amazon-Elastic-Container-Service_64',
    defaultConfig: { cpu: 256, memory: 512, desiredCount: 1, assignPublicIp: false },
    cfnResourceType: 'AWS::ECS::Service',
    pricingDimensions: [
      { name: 'vcpuHours', unit: 'vCPU-hours', description: 'vCPU usage per hour' },
      { name: 'memoryGbHours', unit: 'GB-hours', description: 'Memory usage per hour' },
    ],
    waConsiderations: ['Use ARM64 for cost savings', 'Place in private subnets', 'Configure health checks', 'Use task role with least-privilege IAM'],
  },
  'ecr': {
    type: 'ecr',
    displayName: 'Amazon ECR',
    category: 'containers',
    description: 'Managed container image registry',
    iconKey: 'Arch_Amazon-Elastic-Container-Registry_64',
    defaultConfig: { imageScanOnPush: true, imageTagMutability: 'IMMUTABLE', encryptionType: 'AES256' },
    cfnResourceType: 'AWS::ECR::Repository',
    pricingDimensions: [
      { name: 'storage', unit: 'GB-month', description: 'Image storage' },
      { name: 'dataTransfer', unit: 'GB', description: 'Data transfer out' },
    ],
    waConsiderations: ['Enable image scanning on push', 'Use immutable tags', 'Configure lifecycle policies to clean old images'],
  },
  'cloudwatch': {
    type: 'cloudwatch',
    displayName: 'Amazon CloudWatch',
    category: 'monitoring',
    description: 'Monitoring and observability service for AWS resources',
    iconKey: 'Arch_Amazon-CloudWatch_64',
    defaultConfig: { retentionDays: 30, alarmActionsEnabled: true },
    cfnResourceType: 'AWS::CloudWatch::Alarm',
    pricingDimensions: [
      { name: 'metrics', unit: 'metrics', description: 'Custom metrics' },
      { name: 'dashboards', unit: 'dashboards', description: 'Dashboards' },
      { name: 'logsIngested', unit: 'GB', description: 'Log data ingested' },
    ],
    waConsiderations: ['Set up alarms for key metrics', 'Configure log retention periods', 'Use metric filters for log-based metrics', 'Enable Container Insights for ECS'],
  },
  'cloudtrail': {
    type: 'cloudtrail',
    displayName: 'AWS CloudTrail',
    category: 'monitoring',
    description: 'Governance, compliance, and audit logging for AWS API calls',
    iconKey: 'Arch_AWS-CloudTrail_64',
    defaultConfig: { isMultiRegionTrail: true, enableLogFileValidation: true, includeGlobalServiceEvents: true },
    cfnResourceType: 'AWS::CloudTrail::Trail',
    pricingDimensions: [
      { name: 'managementEvents', unit: 'events', description: 'Management events (first trail free)' },
      { name: 'dataEvents', unit: 'events', description: 'Data events logged' },
    ],
    waConsiderations: ['Enable log file validation', 'Store logs in a separate account S3 bucket', 'Enable multi-region trail', 'Monitor with CloudWatch Logs'],
  },
  'waf': {
    type: 'waf',
    displayName: 'AWS WAF',
    category: 'security',
    description: 'Web application firewall to protect against common web exploits',
    iconKey: 'Arch_AWS-WAF_64',
    defaultConfig: { defaultAction: 'ALLOW', managedRuleGroups: ['AWSManagedRulesCommonRuleSet', 'AWSManagedRulesKnownBadInputsRuleSet'] },
    cfnResourceType: 'AWS::WAFv2::WebACL',
    pricingDimensions: [
      { name: 'webAcl', unit: 'ACL-month', description: 'Web ACL usage' },
      { name: 'rules', unit: 'rule-month', description: 'Rules per ACL' },
      { name: 'requests', unit: 'requests', description: 'Requests processed' },
    ],
    waConsiderations: ['Use AWS Managed Rules as baseline', 'Enable logging for audit', 'Set up rate-based rules for DDoS protection', 'Associate with CloudFront or API Gateway'],
  },
  'secrets-manager': {
    type: 'secrets-manager',
    displayName: 'AWS Secrets Manager',
    category: 'security',
    description: 'Securely store and rotate secrets, API keys, and credentials',
    iconKey: 'Arch_AWS-Secrets-Manager_64',
    defaultConfig: { rotationEnabled: false },
    cfnResourceType: 'AWS::SecretsManager::Secret',
    pricingDimensions: [
      { name: 'secrets', unit: 'secret-month', description: 'Secrets stored' },
      { name: 'apiCalls', unit: 'requests', description: 'API calls' },
    ],
    waConsiderations: ['Enable automatic rotation', 'Use resource-based policies for cross-account access', 'Cache secrets in Lambda extensions'],
  },
  'kms': {
    type: 'kms',
    displayName: 'AWS KMS',
    category: 'security',
    description: 'Managed encryption key creation and control',
    iconKey: 'Arch_AWS-Key-Management-Service_64',
    defaultConfig: { keySpec: 'SYMMETRIC_DEFAULT', enableKeyRotation: true },
    cfnResourceType: 'AWS::KMS::Key',
    pricingDimensions: [
      { name: 'keys', unit: 'key-month', description: 'Customer managed keys' },
      { name: 'requests', unit: 'requests', description: 'Cryptographic requests' },
    ],
    waConsiderations: ['Enable automatic key rotation', 'Use key policies with least privilege', 'Use separate keys per data classification level'],
  },
};

export const SERVICE_CATEGORIES: Record<ServiceCategory, { displayName: string; description: string }> = {
  compute: { displayName: 'Compute', description: 'Processing and execution services' },
  storage: { displayName: 'Storage', description: 'Object, file, and block storage' },
  database: { displayName: 'Database', description: 'Relational and NoSQL databases' },
  networking: { displayName: 'Networking', description: 'API management, CDN, and load balancing' },
  security: { displayName: 'Security', description: 'Identity, access, encryption, and protection' },
  messaging: { displayName: 'Messaging', description: 'Queues, topics, and streaming' },
  integration: { displayName: 'Integration', description: 'Workflow orchestration and event routing' },
  monitoring: { displayName: 'Monitoring', description: 'Logging, metrics, and auditing' },
  ml: { displayName: 'Machine Learning', description: 'AI and ML services' },
  containers: { displayName: 'Containers', description: 'Container orchestration and registry' },
};
