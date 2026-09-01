import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { ok, badRequest, serverError } from '../../middleware/api-response';
import type { ArchitectureModel } from '@aws-arch-advisor/shared';

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const path = event.resource;

    if (path.includes('templates')) return listTemplates();
    if (path.includes('cost-estimate')) return estimateCost(event.body);

    return badRequest('Unsupported method');
  } catch (err) {
    console.error('AI handler error:', err);
    return serverError();
  }
}

async function listTemplates(): Promise<APIGatewayProxyResult> {
  const templates: Array<{
    templateId: string;
    name: string;
    description: string;
    category: string;
    services: string[];
    estimatedCostUsd: number;
    architecture: Partial<ArchitectureModel>;
  }> = [
    {
      templateId: 'web-app',
      name: 'Serverless Web App',
      description: 'Full-stack serverless application with React frontend, API Gateway, Lambda, DynamoDB, and Cognito authentication.',
      category: 'Full Stack',
      services: ['cloudfront', 's3', 'api-gateway', 'lambda', 'dynamodb', 'cognito'],
      estimatedCostUsd: 5,
      architecture: {
        schemaVersion: '1.0',
        resources: [
          { id: 'cf-1', type: 'cloudfront', name: 'CDN', logicalId: 'CloudFrontDist', config: {} },
          { id: 's3-1', type: 's3', name: 'Static Assets', logicalId: 'StaticBucket', config: {} },
          { id: 'apigw-1', type: 'api-gateway', name: 'REST API', logicalId: 'ApiGateway', config: {} },
          { id: 'fn-1', type: 'lambda', name: 'API Handler', logicalId: 'ApiFunction', config: { runtime: 'nodejs20.x' } },
          { id: 'db-1', type: 'dynamodb', name: 'App Data', logicalId: 'AppTable', config: { billingMode: 'PAY_PER_REQUEST' } },
          { id: 'auth-1', type: 'cognito', name: 'Auth', logicalId: 'UserPool', config: {} },
        ],
        connections: [],
      },
    },
    {
      templateId: 'api-backend',
      name: 'REST API Backend',
      description: 'Production-ready REST API with Lambda functions, DynamoDB, and API key authentication.',
      category: 'Backend',
      services: ['api-gateway', 'lambda', 'dynamodb', 'cloudwatch'],
      estimatedCostUsd: 3,
      architecture: {
        schemaVersion: '1.0',
        resources: [
          { id: 'apigw-1', type: 'api-gateway', name: 'REST API', logicalId: 'ApiGateway', config: {} },
          { id: 'fn-1', type: 'lambda', name: 'CRUD Handler', logicalId: 'CrudFunction', config: { runtime: 'nodejs20.x' } },
          { id: 'db-1', type: 'dynamodb', name: 'Data Store', logicalId: 'DataTable', config: { billingMode: 'PAY_PER_REQUEST' } },
          { id: 'cw-1', type: 'cloudwatch', name: 'Monitoring', logicalId: 'Dashboard', config: {} },
        ],
        connections: [],
      },
    },
    {
      templateId: 'data-pipeline',
      name: 'Event-Driven Data Pipeline',
      description: 'Asynchronous data processing pipeline with SQS queues, Lambda processors, and S3 storage.',
      category: 'Data',
      services: ['sqs', 'lambda', 's3', 'eventbridge', 'cloudwatch'],
      estimatedCostUsd: 4,
      architecture: {
        schemaVersion: '1.0',
        resources: [
          { id: 'eb-1', type: 'eventbridge', name: 'Event Bus', logicalId: 'EventBus', config: {} },
          { id: 'sqs-1', type: 'sqs', name: 'Processing Queue', logicalId: 'ProcessingQueue', config: {} },
          { id: 'fn-1', type: 'lambda', name: 'Processor', logicalId: 'ProcessorFunction', config: { runtime: 'nodejs20.x' } },
          { id: 's3-1', type: 's3', name: 'Data Lake', logicalId: 'DataBucket', config: {} },
          { id: 'cw-1', type: 'cloudwatch', name: 'Monitoring', logicalId: 'Dashboard', config: {} },
        ],
        connections: [],
      },
    },
    {
      templateId: 'ml-inference',
      name: 'ML Inference Service',
      description: 'Scalable ML inference endpoint with API Gateway, Lambda, and S3 model storage.',
      category: 'Machine Learning',
      services: ['api-gateway', 'lambda', 's3', 'cloudwatch', 'sqs'],
      estimatedCostUsd: 8,
      architecture: {
        schemaVersion: '1.0',
        resources: [
          { id: 'apigw-1', type: 'api-gateway', name: 'Inference API', logicalId: 'InferenceApi', config: {} },
          { id: 'fn-1', type: 'lambda', name: 'Inference Handler', logicalId: 'InferenceFunction', config: { runtime: 'nodejs20.x', memorySize: 1024 } },
          { id: 's3-1', type: 's3', name: 'Model Store', logicalId: 'ModelBucket', config: {} },
          { id: 'sqs-1', type: 'sqs', name: 'Batch Queue', logicalId: 'BatchQueue', config: {} },
          { id: 'cw-1', type: 'cloudwatch', name: 'Monitoring', logicalId: 'Dashboard', config: {} },
        ],
        connections: [],
      },
    },
    {
      templateId: 'static-site',
      name: 'Static Website',
      description: 'Fast, secure static website hosted on S3 with CloudFront CDN and custom domain support.',
      category: 'Frontend',
      services: ['cloudfront', 's3', 'waf'],
      estimatedCostUsd: 1,
      architecture: {
        schemaVersion: '1.0',
        resources: [
          { id: 'cf-1', type: 'cloudfront', name: 'CDN', logicalId: 'CloudFrontDist', config: {} },
          { id: 's3-1', type: 's3', name: 'Website Bucket', logicalId: 'WebsiteBucket', config: {} },
          { id: 'waf-1', type: 'waf', name: 'WAF', logicalId: 'WebAcl', config: {} },
        ],
        connections: [],
      },
    },
  ];

  return ok({ templates });
}

async function estimateCost(body: string | null): Promise<APIGatewayProxyResult> {
  if (!body) return badRequest('Request body is required');

  const parsed = JSON.parse(body);
  const architecture = parsed.architecture as ArchitectureModel;
  if (!architecture || !architecture.resources) return badRequest('architecture with resources is required');

  const { estimateCost: estimate } = await import('../../services/cost-estimator');
  const result = await estimate(architecture);

  return ok(result);
}
