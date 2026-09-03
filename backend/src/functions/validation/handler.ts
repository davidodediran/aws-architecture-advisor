import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { extractAuth } from '../../middleware/auth';
import { ok, badRequest, notFound, unauthorized, serverError } from '../../middleware/api-response';
import { queryItems } from '../../services/dynamo-client';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const TEMPLATES_BUCKET = process.env.TEMPLATES_BUCKET!;
const PROJECTS_TABLE = process.env.PROJECTS_TABLE!;

const s3 = new S3Client({});

const ALLOWED_CONTENT_TYPES = [
  'application/json',
  'application/yaml',
  'text/yaml',
  'text/plain',
  'image/png',
  'image/svg+xml',
];

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const auth = extractAuth(event);
    if (!auth) return unauthorized();
    const path = event.resource;
    const method = event.httpMethod;

    if (method === 'POST' && path.includes('validate/cfn')) return validateCfnTemplate(event.body);
    if (method === 'POST' && path.includes('upload-url')) return getUploadUrl(auth.userId, event.body);
    if (method === 'GET' && path.includes('export')) return exportProject(auth.userId, event.pathParameters?.projectId);

    return badRequest('Unsupported endpoint');
  } catch (err) {
    console.error('Validation handler error:', err);
    return serverError();
  }
}

async function validateCfnTemplate(body: string | null): Promise<APIGatewayProxyResult> {
  if (!body) return badRequest('Request body is required');

  const parsed = JSON.parse(body);
  const { template } = parsed;
  if (!template) return badRequest('template is required');

  const { validateTemplate } = await import('../../services/cfn-validator');
  const result = await validateTemplate(template);

  return ok(result);
}

function sanitizeFilename(filename: string): string {
  return filename
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/\.{2,}/g, '.')
    .slice(0, 255);
}

async function getUploadUrl(userId: string, body: string | null): Promise<APIGatewayProxyResult> {
  if (!body) return badRequest('Request body is required');

  const parsed = JSON.parse(body);
  const { filename, contentType, projectId } = parsed;

  if (!filename || !contentType || !projectId) {
    return badRequest('filename, contentType, and projectId are required');
  }

  if (!ALLOWED_CONTENT_TYPES.includes(contentType)) {
    return badRequest(`Content type not allowed. Allowed: ${ALLOWED_CONTENT_TYPES.join(', ')}`);
  }

  const sanitized = sanitizeFilename(filename);
  const key = `uploads/${userId}/${projectId}/${Date.now()}-${sanitized}`;

  const command = new PutObjectCommand({
    Bucket: TEMPLATES_BUCKET,
    Key: key,
    ContentType: contentType,
  });

  const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 300 });

  return ok({ uploadUrl, key, expiresIn: 300 });
}

async function exportProject(userId: string, projectId: string | undefined): Promise<APIGatewayProxyResult> {
  if (!projectId) return badRequest('projectId is required');

  const projects = await queryItems<Record<string, unknown>>(
    PROJECTS_TABLE,
    'pk = :pk AND sk = :sk',
    { ':pk': `USER#${userId}`, ':sk': `PROJECT#${projectId}` },
  );

  if (!projects[0]) return notFound(`Project ${projectId} not found`);

  const project = projects[0];
  const manifest = {
    exportedAt: new Date().toISOString(),
    userId,
    project: {
      projectId: project.projectId,
      name: project.name,
      description: project.description,
      status: project.status,
      region: project.region,
      createdAt: project.createdAt,
    },
  };

  const manifestKey = `exports/${userId}/${projectId}/export-${Date.now()}.json`;
  await s3.send(new PutObjectCommand({
    Bucket: TEMPLATES_BUCKET,
    Key: manifestKey,
    Body: JSON.stringify(manifest, null, 2),
    ContentType: 'application/json',
  }));

  const downloadUrl = await getSignedUrl(
    s3,
    new GetObjectCommand({ Bucket: TEMPLATES_BUCKET, Key: manifestKey }),
    { expiresIn: 3600 },
  );

  return ok({ downloadUrl, expiresIn: 3600 });
}
