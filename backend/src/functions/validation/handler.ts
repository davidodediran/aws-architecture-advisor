import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { extractAuth } from '../../middleware/auth';
import { ok, badRequest, serverError } from '../../middleware/api-response';
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
    const path = event.resource;

    if (path.includes('upload-url')) return getUploadUrl(auth.userId, event.body);
    if (path.includes('export-portfolio')) return exportPortfolio(auth.userId);

    return badRequest('Unsupported endpoint');
  } catch (err) {
    console.error('Validation handler error:', err);
    return serverError();
  }
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

async function exportPortfolio(userId: string): Promise<APIGatewayProxyResult> {
  const projects = await queryItems<Record<string, unknown>>(
    PROJECTS_TABLE,
    'pk = :pk',
    { ':pk': `USER#${userId}` },
  );

  const manifest = {
    exportedAt: new Date().toISOString(),
    userId,
    projectCount: projects.length,
    projects: projects.map((p) => ({
      projectId: p.projectId,
      name: p.name,
      status: p.status,
    })),
  };

  const manifestKey = `exports/${userId}/portfolio-${Date.now()}.json`;
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
