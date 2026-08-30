import type { APIGatewayProxyEvent } from 'aws-lambda';

export interface AuthContext {
  userId: string;
  email: string;
  groups: string[];
}

export function extractAuth(event: APIGatewayProxyEvent): AuthContext {
  const claims = event.requestContext.authorizer?.claims ?? {};
  return {
    userId: claims['sub'] ?? '',
    email: claims['email'] ?? '',
    groups: parseGroups(claims['cognito:groups']),
  };
}

function parseGroups(groups: unknown): string[] {
  if (typeof groups === 'string') return groups.split(',').map((g) => g.trim());
  if (Array.isArray(groups)) return groups;
  return [];
}

export function isTrainer(auth: AuthContext): boolean {
  return auth.groups.includes('trainers');
}
