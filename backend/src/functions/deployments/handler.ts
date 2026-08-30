import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { extractAuth } from '../../middleware/auth';
import { ok, badRequest, notFound, serverError } from '../../middleware/api-response';

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const auth = extractAuth(event);
    const method = event.httpMethod;
    const deploymentId = event.pathParameters?.deploymentId;

    if (method === 'POST' && !deploymentId) return requestDeployment(auth.userId, event.body);
    if (method === 'GET' && deploymentId) return getDeploymentStatus(auth.userId, deploymentId);
    if (method === 'DELETE' && deploymentId) return deleteStack(auth.userId, deploymentId);

    return badRequest('Unsupported method');
  } catch {
    return serverError();
  }
}

async function requestDeployment(userId: string, body: string | null): Promise<APIGatewayProxyResult> {
  if (!body) return badRequest('Request body is required');

  // TODO: Parse body with Zod (RequestDeploymentRequest)
  // TODO: Load architecture model and CFN template
  // TODO: Estimate cost via AWS Pricing API (cached in DynamoDB)
  // TODO: Compare estimated cost against budget config
  // TODO: If over budget, return suggestions without deploying
  // TODO: STS AssumeRole with student's roleArn + ExternalId
  // TODO: Apply session policy restricting to naming prefix
  // TODO: Create CloudFormation stack via assumed role
  // TODO: Configure CloudWatch billing alarm
  // TODO: Save deployment record to DynamoDB
  // TODO: If cleanupLambdaEnabled, schedule cleanup Lambda

  return ok({
    deploymentId: 'placeholder',
    estimatedCostUsd: 0,
    budgetComparison: {
      estimatedMonthlyUsd: 0,
      budgetLimitUsd: 0,
      withinBudget: true,
    },
    status: 'pending-approval',
  });
}

async function getDeploymentStatus(userId: string, deploymentId: string): Promise<APIGatewayProxyResult> {
  // TODO: Get deployment record from DynamoDB
  // TODO: If status is 'creating', check CloudFormation stack status
  // TODO: Fetch recent stack events
  // TODO: Update record if status changed

  return notFound(`Deployment ${deploymentId} not found`);
}

async function deleteStack(userId: string, deploymentId: string): Promise<APIGatewayProxyResult> {
  // TODO: Get deployment record
  // TODO: Verify ownership
  // TODO: STS AssumeRole to student's account
  // TODO: Delete CloudFormation stack
  // TODO: Update deployment status to 'deleting'
  // TODO: Log audit event

  return ok({ deploymentId, status: 'deleting' });
}
