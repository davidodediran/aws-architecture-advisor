import type { APIGatewayProxyEvent, APIGatewayProxyResult, APIGatewayRequestAuthorizerEvent, APIGatewayAuthorizerResult } from 'aws-lambda';
import { extractAuth, isTrainer } from '../../middleware/auth';
import { ok, badRequest, forbidden, unauthorized, serverError } from '../../middleware/api-response';

export async function authorizer(event: APIGatewayRequestAuthorizerEvent): Promise<APIGatewayAuthorizerResult> {
  // TODO: Extract JWT from Authorization header
  // TODO: Verify JWT signature against Cognito JWKS
  // TODO: Check token expiration
  // TODO: Check rate limit per user (DynamoDB counter with TTL)
  // TODO: Return IAM policy allowing/denying invocation

  const principalId = 'user';
  return {
    principalId,
    policyDocument: {
      Version: '2012-10-17',
      Statement: [{ Action: 'execute-api:Invoke', Effect: 'Deny', Resource: event.methodArn }],
    },
  };
}

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const auth = extractAuth(event);
    if (!auth) return unauthorized();
    const path = event.resource;

    if (path.includes('trainer-unlock')) return trainerUnlock(auth, event.body);

    return badRequest('Unsupported endpoint');
  } catch {
    return serverError();
  }
}

async function trainerUnlock(auth: { userId: string; email: string; groups: string[] }, body: string | null): Promise<APIGatewayProxyResult> {
  if (!isTrainer(auth)) return forbidden('Only trainers can unlock student accounts');
  if (!body) return badRequest('Request body is required');

  // TODO: Parse body with Zod (UnlockStudentRequest)
  // TODO: Verify student exists
  // TODO: Update student's UserQuota record in DynamoDB:
  //   - Increase projectLimit
  //   - Set tier to 'unlocked'
  //   - Record unlockedBy (trainer userId) and unlockedAt
  // TODO: Log audit event

  return ok({ message: 'Student account unlocked' });
}

export async function websocketAuthorizer(event: APIGatewayRequestAuthorizerEvent): Promise<APIGatewayAuthorizerResult> {
  // TODO: Extract token from query string (?token=...)
  // TODO: Verify JWT against Cognito JWKS
  // TODO: Return IAM policy for $connect route

  const principalId = 'user';
  return {
    principalId,
    policyDocument: {
      Version: '2012-10-17',
      Statement: [{ Action: 'execute-api:Invoke', Effect: 'Deny', Resource: event.methodArn }],
    },
  };
}
