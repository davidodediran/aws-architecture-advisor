import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { extractAuth } from '../../middleware/auth';
import { ok, created, badRequest, notFound, serverError } from '../../middleware/api-response';

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const auth = extractAuth(event);
    const method = event.httpMethod;
    const projectId = event.pathParameters?.projectId;

    if (method === 'POST' && !projectId) return createProject(auth.userId, event.body);
    if (method === 'GET' && !projectId) return listProjects(auth.userId);
    if (method === 'GET' && projectId) return getProject(auth.userId, projectId);
    if (method === 'DELETE' && projectId) return deleteProject(auth.userId, projectId);

    return badRequest('Unsupported method');
  } catch {
    return serverError();
  }
}

async function createProject(userId: string, body: string | null): Promise<APIGatewayProxyResult> {
  if (!body) return badRequest('Request body is required');

  // TODO: Parse body with Zod
  // TODO: Check user quota (free tier limit)
  // TODO: Generate projectId with ULID
  // TODO: Put item in DynamoDB projects table
  // TODO: Return created project

  return created({ projectId: 'placeholder', name: 'placeholder', status: 'designing', createdAt: new Date().toISOString() });
}

async function listProjects(userId: string): Promise<APIGatewayProxyResult> {
  // TODO: Query DynamoDB projects table by userId
  // TODO: Support pagination with nextToken

  return ok({ projects: [], nextToken: undefined });
}

async function getProject(userId: string, projectId: string): Promise<APIGatewayProxyResult> {
  // TODO: Get item from DynamoDB projects table
  // TODO: Verify ownership (userId matches)

  return notFound(`Project ${projectId} not found`);
}

async function deleteProject(userId: string, projectId: string): Promise<APIGatewayProxyResult> {
  // TODO: Verify ownership
  // TODO: Check no active deployments
  // TODO: Soft-delete (set status to 'deleted')

  return ok({ message: `Project ${projectId} deleted` });
}
