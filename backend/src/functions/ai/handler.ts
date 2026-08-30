import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { ok, badRequest, serverError } from '../../middleware/api-response';

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const path = event.resource;

    if (path.includes('templates')) return listTemplates();
    if (path.includes('cost-estimate')) return estimateCost(event.body);

    return badRequest('Unsupported method');
  } catch {
    return serverError();
  }
}

async function listTemplates(): Promise<APIGatewayProxyResult> {
  const templates = [
    {
      templateId: 'serverless-web-app',
      name: 'Serverless Web App',
      description: 'Full-stack serverless application with React frontend, API Gateway, Lambda, DynamoDB, and Cognito authentication.',
      category: 'Full Stack',
      services: ['cloudfront', 's3', 'api-gateway', 'lambda', 'dynamodb', 'cognito'],
      estimatedCostUsd: 5,
    },
    {
      templateId: 'rest-api-backend',
      name: 'REST API Backend',
      description: 'Production-ready REST API with Lambda functions, DynamoDB, and API key authentication.',
      category: 'Backend',
      services: ['api-gateway', 'lambda', 'dynamodb', 'cloudwatch'],
      estimatedCostUsd: 3,
    },
    {
      templateId: 'event-driven-pipeline',
      name: 'Event-Driven Data Pipeline',
      description: 'Asynchronous data processing pipeline with SQS queues, Lambda processors, and S3 storage.',
      category: 'Data',
      services: ['sqs', 'lambda', 's3', 'eventbridge', 'cloudwatch'],
      estimatedCostUsd: 4,
    },
    {
      templateId: 'ml-inference-service',
      name: 'ML Inference Service',
      description: 'Scalable ML inference endpoint with API Gateway, Lambda, and S3 model storage.',
      category: 'Machine Learning',
      services: ['api-gateway', 'lambda', 's3', 'cloudwatch', 'sqs'],
      estimatedCostUsd: 8,
    },
    {
      templateId: 'static-website',
      name: 'Static Website',
      description: 'Fast, secure static website hosted on S3 with CloudFront CDN and custom domain support.',
      category: 'Frontend',
      services: ['cloudfront', 's3', 'waf'],
      estimatedCostUsd: 1,
    },
  ];

  return ok({ templates });
}

async function estimateCost(body: string | null): Promise<APIGatewayProxyResult> {
  if (!body) return badRequest('Request body is required');

  // TODO: Parse architecture model from body
  // TODO: For each resource, look up pricing:
  //   1. Check DynamoDB price cache (TTL-based)
  //   2. If miss, query AWS Pricing API
  //   3. Cache result in DynamoDB with TTL
  // TODO: Calculate per-resource and total monthly estimates
  // TODO: Return breakdown with assumptions

  return ok({
    totalMonthlyUsd: 0,
    resources: [],
    assumptions: ['Estimates based on AWS public pricing', 'Actual costs may vary based on usage'],
  });
}
