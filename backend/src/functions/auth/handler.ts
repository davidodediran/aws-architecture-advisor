import type {
  APIGatewayProxyEvent,
  APIGatewayProxyResult,
  APIGatewayRequestAuthorizerEvent,
  APIGatewayAuthorizerResult,
} from 'aws-lambda';
import { extractAuth, isTrainer } from '../../middleware/auth';
import { ok, badRequest, forbidden, unauthorized, serverError } from '../../middleware/api-response';
import { getItem, putItem, updateItem } from '../../services/dynamo-client';

const USER_QUOTA_TABLE = process.env.USER_QUOTA_TABLE!;

interface RateLimitRecord {
  pk: string;
  sk: string;
  requestCount: number;
  windowStart: number;
  expiresAt: number;
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = Buffer.from(parts[1], 'base64url').toString('utf-8');
    return JSON.parse(payload);
  } catch {
    return null;
  }
}

function generatePolicy(
  principalId: string,
  effect: 'Allow' | 'Deny',
  resource: string,
  context?: Record<string, string>,
): APIGatewayAuthorizerResult {
  return {
    principalId,
    policyDocument: {
      Version: '2012-10-17',
      Statement: [{ Action: 'execute-api:Invoke', Effect: effect, Resource: resource }],
    },
    context,
  };
}

export async function authorizer(event: APIGatewayRequestAuthorizerEvent): Promise<APIGatewayAuthorizerResult> {
  const authHeader = event.headers?.['Authorization'] ?? event.headers?.['authorization'] ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';

  if (!token) {
    return generatePolicy('anonymous', 'Deny', event.methodArn);
  }

  const payload = decodeJwtPayload(token);
  if (!payload) {
    return generatePolicy('anonymous', 'Deny', event.methodArn);
  }

  const sub = payload.sub as string | undefined;
  if (!sub) {
    return generatePolicy('anonymous', 'Deny', event.methodArn);
  }

  const exp = payload.exp as number | undefined;
  if (exp && exp < Math.floor(Date.now() / 1000)) {
    return generatePolicy(sub, 'Deny', event.methodArn);
  }

  const now = Date.now();
  const windowMs = 3600_000;
  const maxRequests = 100;

  const rateLimitKey = { pk: `RATE#${sub}`, sk: 'limit' };
  const rateRecord = await getItem<RateLimitRecord>(USER_QUOTA_TABLE, rateLimitKey);

  if (rateRecord && rateRecord.windowStart > now - windowMs) {
    if (rateRecord.requestCount >= maxRequests) {
      return generatePolicy(sub, 'Deny', event.methodArn);
    }
    await updateItem(
      USER_QUOTA_TABLE,
      rateLimitKey,
      'SET requestCount = requestCount + :one',
      { ':one': 1 },
    );
  } else {
    await putItem(USER_QUOTA_TABLE, {
      pk: `RATE#${sub}`,
      sk: 'limit',
      requestCount: 1,
      windowStart: now,
      expiresAt: Math.floor((now + windowMs * 2) / 1000),
    });
  }

  const arnParts = event.methodArn.split(':');
  const apiGatewayArn = arnParts[5].split('/');
  const wildcardArn = `${arnParts[0]}:${arnParts[1]}:${arnParts[2]}:${arnParts[3]}:${arnParts[4]}:${apiGatewayArn[0]}/${apiGatewayArn[1]}/*`;

  return generatePolicy(sub, 'Allow', wildcardArn, {
    userId: sub,
    email: (payload.email as string) ?? '',
  });
}

export async function trainerUnlock(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const auth = extractAuth(event);
    if (!auth) return unauthorized();
    if (!isTrainer(auth)) return forbidden('Only trainers can unlock student accounts');
    if (!event.body) return badRequest('Request body is required');

    const parsed = JSON.parse(event.body);
    const { studentUserId, additionalProjects } = parsed;

    if (!studentUserId || !additionalProjects || additionalProjects < 1) {
      return badRequest('studentUserId and additionalProjects (>= 1) are required');
    }

    await updateItem(
      USER_QUOTA_TABLE,
      { pk: `USER#${studentUserId}`, sk: 'quota' },
      'SET maxProjects = if_not_exists(maxProjects, :defaultMax) + :additional, tier = :tier, unlockedBy = :trainer, unlockedAt = :now',
      {
        ':defaultMax': 3,
        ':additional': additionalProjects,
        ':tier': 'unlocked',
        ':trainer': auth.userId,
        ':now': new Date().toISOString(),
      },
    );

    return ok({ message: `Unlocked ${additionalProjects} additional projects for student ${studentUserId}` });
  } catch (err) {
    console.error('Trainer unlock error:', err);
    return serverError();
  }
}

export async function websocketAuthorizer(event: APIGatewayRequestAuthorizerEvent): Promise<APIGatewayAuthorizerResult> {
  const token = event.queryStringParameters?.token ?? '';

  if (!token) {
    return generatePolicy('anonymous', 'Deny', event.methodArn);
  }

  const payload = decodeJwtPayload(token);
  if (!payload) {
    return generatePolicy('anonymous', 'Deny', event.methodArn);
  }

  const sub = payload.sub as string | undefined;
  if (!sub) {
    return generatePolicy('anonymous', 'Deny', event.methodArn);
  }

  const exp = payload.exp as number | undefined;
  if (exp && exp < Math.floor(Date.now() / 1000)) {
    return generatePolicy(sub, 'Deny', event.methodArn);
  }

  return generatePolicy(sub, 'Allow', event.methodArn, {
    userId: sub,
  });
}
