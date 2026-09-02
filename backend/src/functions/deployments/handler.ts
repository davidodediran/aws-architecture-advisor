import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { extractAuth } from '../../middleware/auth';
import { ok, badRequest, forbidden, notFound, serverError } from '../../middleware/api-response';
import { getItem, queryItems, updateItem } from '../../services/dynamo-client';
import type { ArchitectureModel } from '@aws-arch-advisor/shared';

const ARCHITECTURES_TABLE = process.env.ARCHITECTURE_VERSIONS_TABLE!;
const DEPLOYMENTS_TABLE = process.env.DEPLOYMENTS_TABLE!;

interface ArchitectureVersionRecord {
  pk: string;
  sk: string;
  versionId: string;
  architecture: ArchitectureModel;
}

interface DeploymentRecord {
  pk: string;
  sk: string;
  deploymentId: string;
  projectId: string;
  userId: string;
  status: string;
  estimatedCostUsd: number;
  createdAt: string;
}

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const auth = extractAuth(event);
    const method = event.httpMethod;
    const projectId = event.pathParameters?.projectId;

    if (!projectId) return badRequest('projectId is required');

    if (method === 'POST' && event.resource.endsWith('/deploy')) return requestDeployment(auth.userId, projectId, event.body);
    if (method === 'GET' && event.resource.includes('/deploy/status')) return getStackStatus(auth.userId, projectId);
    if (method === 'DELETE' && event.resource.endsWith('/deploy')) return deleteDeployedStack(auth.userId, projectId);

    return badRequest('Unsupported method');
  } catch (err) {
    console.error('Deployments handler error:', err);
    return serverError();
  }
}

async function requestDeployment(userId: string, projectId: string, body: string | null): Promise<APIGatewayProxyResult> {
  if (!body) return badRequest('Request body is required');

  const parsed = JSON.parse(body);
  const { roleArn, externalId, maxMonthlySpend } = parsed;

  if (!roleArn) return badRequest('roleArn is required');

  const versions = await queryItems<ArchitectureVersionRecord>(
    ARCHITECTURES_TABLE,
    'pk = :pk',
    { ':pk': `PROJECT#${projectId}` },
    { scanForward: false, limit: 1 },
  );

  if (!versions[0]) return notFound('No architecture found for this project');

  const architecture = versions[0].architecture;

  const { estimateCost } = await import('../../services/cost-estimator');
  const costEstimate = await estimateCost(architecture);

  const { checkBudget } = await import('../../services/budget-gate');
  const budgetLimit = maxMonthlySpend ?? 10;
  const budgetResult = checkBudget(costEstimate.totalMonthlyUsd, budgetLimit);

  if (!budgetResult.approved) {
    return forbidden(budgetResult.message);
  }

  const { deployStack } = await import('../../services/deployment-engine');
  const deployment = await deployStack(userId, projectId, architecture, costEstimate, {
    roleArn,
    externalId,
  });

  return ok({
    deploymentId: deployment.deploymentId,
    status: deployment.status,
    estimatedCostUsd: costEstimate.totalMonthlyUsd,
    budgetWarning: budgetResult.warningLevel !== 'none' ? budgetResult.message : undefined,
  });
}

async function getStackStatus(userId: string, projectId: string): Promise<APIGatewayProxyResult> {
  const deployments = await queryItems<DeploymentRecord>(
    DEPLOYMENTS_TABLE,
    'pk = :pk',
    { ':pk': `PROJECT#${projectId}` },
    { scanForward: false, limit: 1 },
  );

  if (!deployments[0]) return notFound('No deployment found for this project');

  return ok({
    deploymentId: deployments[0].deploymentId,
    status: deployments[0].status,
    estimatedCostUsd: deployments[0].estimatedCostUsd,
    createdAt: deployments[0].createdAt,
  });
}

async function deleteDeployedStack(userId: string, projectId: string): Promise<APIGatewayProxyResult> {
  const deployments = await queryItems<DeploymentRecord>(
    DEPLOYMENTS_TABLE,
    'pk = :pk',
    { ':pk': `PROJECT#${projectId}` },
    { scanForward: false, limit: 1 },
  );

  if (!deployments[0]) return notFound('No deployment found for this project');

  const { deleteStack } = await import('../../services/deployment-engine');
  await deleteStack(deployments[0].deploymentId);

  await updateItem(
    DEPLOYMENTS_TABLE,
    { pk: `PROJECT#${projectId}`, sk: deployments[0].sk },
    'SET #s = :status',
    { ':status': 'deleting' },
  );

  return ok({ deploymentId: deployments[0].deploymentId, status: 'deleting' });
}
