import type { APIGatewayProxyEvent } from 'aws-lambda';

export interface AuthContext {
  userId: string;
  email: string;
  groups: string[];
}

export function extractAuth(event: APIGatewayProxyEvent): AuthContext | null {
  const claims = event.requestContext.authorizer?.claims;
  if (!claims) return null;

  return {
    userId: claims.sub ?? '',
    email: claims.email ?? '',
    groups: typeof claims['cognito:groups'] === 'string'
      ? claims['cognito:groups'].split(',').map((g: string) => g.trim())
      : [],
  };
}

export function isTrainer(auth: AuthContext): boolean {
  return auth.groups.includes('trainers');
}
