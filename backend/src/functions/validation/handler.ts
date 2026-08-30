import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { extractAuth } from '../../middleware/auth';
import { ok, badRequest, serverError } from '../../middleware/api-response';
import { LIMITS } from '@aws-arch-advisor/shared';

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const auth = extractAuth(event);
    const path = event.resource;

    if (path.includes('upload-url')) return getUploadUrl(auth.userId, event.body);
    if (path.includes('export-portfolio')) return exportPortfolio(auth.userId);

    return badRequest('Unsupported endpoint');
  } catch {
    return serverError();
  }
}

async function getUploadUrl(userId: string, body: string | null): Promise<APIGatewayProxyResult> {
  if (!body) return badRequest('Request body is required');

  // TODO: Parse body with Zod (GetUploadUrlRequest)
  // TODO: Validate MIME type against LIMITS.UPLOAD_ALLOWED_MIME_TYPES
  // TODO: Generate S3 key: uploads/{userId}/{projectId}/{ulid}/{filename}
  // TODO: Create presigned PUT URL with:
  //   - Content-Type condition
  //   - Content-Length max: LIMITS.MAX_UPLOAD_SIZE_BYTES
  //   - Content-Disposition: attachment
  //   - Expiry: LIMITS.UPLOAD_PRESIGNED_URL_EXPIRY_SECONDS
  // TODO: Return upload URL and key

  return ok({
    uploadUrl: '',
    key: '',
    expiresIn: LIMITS.UPLOAD_PRESIGNED_URL_EXPIRY_SECONDS,
  });
}

async function exportPortfolio(userId: string): Promise<APIGatewayProxyResult> {
  // TODO: Query all user's projects from DynamoDB
  // TODO: For each project, collect:
  //   - Architecture model JSON
  //   - Diagram SVG/PNG
  //   - CFN template YAML
  //   - WA review summary
  //   - Cost estimate
  // TODO: Package as ZIP archive
  // TODO: Upload ZIP to S3
  // TODO: Generate presigned GET URL
  // TODO: Log audit event

  return ok({
    downloadUrl: '',
    expiresIn: 3600,
    contents: [],
  });
}
