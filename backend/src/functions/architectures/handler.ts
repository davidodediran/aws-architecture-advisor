import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { extractAuth } from '../../middleware/auth';
import { ok, badRequest, notFound, unauthorized, serverError } from '../../middleware/api-response';
import { queryItems } from '../../services/dynamo-client';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { retrieveContext, formatContextForPrompt } from '../../services/knowledge-base';
import type { ArchitectureModel } from '@aws-arch-advisor/shared';

const ARCHITECTURES_TABLE = process.env.ARCHITECTURE_VERSIONS_TABLE!;
const TEMPLATES_BUCKET = process.env.TEMPLATES_BUCKET!;

const s3 = new S3Client({});

interface ArchitectureVersionRecord {
  pk: string;
  sk: string;
  versionId: string;
  architecture: ArchitectureModel;
  createdAt: string;
}

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const auth = extractAuth(event);
    if (!auth) return unauthorized();
    const method = event.httpMethod;
    const projectId = event.pathParameters?.projectId;
    const path = event.resource;

    if (!projectId) return badRequest('projectId is required');

    if (method === 'GET' && path.endsWith('/architecture')) return getArchitecture(auth.userId, projectId);
    if (method === 'POST' && path.includes('/cfn')) return generateCfn(auth.userId, projectId);
    if (method === 'POST' && path.includes('/review')) return postWaReview(auth.userId, projectId);
    if (method === 'POST' && path.includes('/cost')) return estimateCost(auth.userId, projectId);

    return badRequest('Unsupported method');
  } catch (err) {
    console.error('Architectures handler error:', err);
    return serverError();
  }
}

async function loadLatestArchitecture(projectId: string): Promise<ArchitectureVersionRecord | null> {
  const versions = await queryItems<ArchitectureVersionRecord>(
    ARCHITECTURES_TABLE,
    'pk = :pk',
    { ':pk': `PROJECT#${projectId}` },
    { scanForward: false, limit: 1 },
  );
  return versions[0] ?? null;
}

async function getArchitecture(_userId: string, projectId: string): Promise<APIGatewayProxyResult> {
  const version = await loadLatestArchitecture(projectId);
  if (!version) return notFound(`Architecture not found for project ${projectId}`);

  return ok({
    projectId,
    versionId: version.versionId,
    architecture: version.architecture,
    createdAt: version.createdAt,
  });
}

async function generateCfn(_userId: string, projectId: string): Promise<APIGatewayProxyResult> {
  const version = await loadLatestArchitecture(projectId);
  if (!version) return notFound(`Architecture not found for project ${projectId}`);

  const { generateTemplate } = await import('../../services/cfn-generator');
  const { validateTemplate } = await import('../../services/cfn-validator');

  const template = generateTemplate(version.architecture);
  const validation = await validateTemplate(template);

  const s3Key = `cfn/${projectId}/${version.versionId}/template.yaml`;
  await s3.send(new PutObjectCommand({
    Bucket: TEMPLATES_BUCKET,
    Key: s3Key,
    Body: template,
    ContentType: 'application/x-yaml',
  }));

  return ok({
    template,
    validation,
    s3Key,
  });
}

async function postWaReview(_userId: string, projectId: string): Promise<APIGatewayProxyResult> {
  const version = await loadLatestArchitecture(projectId);
  if (!version) return notFound(`Architecture not found for project ${projectId}`);

  const ragContexts = await retrieveContext(
    `Well-Architected review for architecture with resources: ${version.architecture.resources.map((r) => r.type).join(', ')}`,
  );
  const ragPrompt = formatContextForPrompt(ragContexts);

  const { reviewArchitecture } = await import('../../services/wa-reviewer');
  const result = await reviewArchitecture(version.architecture, ragPrompt);

  return ok(result);
}

async function estimateCost(_userId: string, projectId: string): Promise<APIGatewayProxyResult> {
  const version = await loadLatestArchitecture(projectId);
  if (!version) return notFound(`Architecture not found for project ${projectId}`);

  const { estimateCost: estimate } = await import('../../services/cost-estimator');
  const result = await estimate(version.architecture);

  return ok(result);
}
