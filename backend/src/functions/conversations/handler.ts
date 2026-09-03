import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { extractAuth } from '../../middleware/auth';
import { ok, badRequest, notFound, unauthorized, serverError } from '../../middleware/api-response';
import { queryItems } from '../../services/dynamo-client';
import { processMessage, getConversationHistory } from '../../services/conversation-engine';

const ARCHITECTURES_TABLE = process.env.ARCHITECTURE_VERSIONS_TABLE!;

interface ArchitectureVersionRecord {
  pk: string;
  sk: string;
  architecture: import('@aws-arch-advisor/shared').ArchitectureModel;
}

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const auth = extractAuth(event);
    if (!auth) return unauthorized();
    const method = event.httpMethod;
    const projectId = event.pathParameters?.projectId;

    if (method === 'POST' && projectId) return sendMessage(auth.userId, projectId, event.body);
    if (method === 'GET' && projectId) return getConversation(auth.userId, projectId);

    return badRequest('Unsupported method');
  } catch (err) {
    console.error('Conversations handler error:', err);
    return serverError();
  }
}

async function sendMessage(userId: string, projectId: string, body: string | null): Promise<APIGatewayProxyResult> {
  if (!body) return badRequest('Request body is required');

  const parsed = JSON.parse(body);
  const { message } = parsed;
  if (!message) return badRequest('message is required');

  const versions = await queryItems<ArchitectureVersionRecord>(
    ARCHITECTURES_TABLE,
    'pk = :pk',
    { ':pk': `PROJECT#${projectId}` },
    { scanForward: false, limit: 1 },
  );

  const existingArchitecture = versions[0]?.architecture;

  const result = await processMessage(userId, projectId, message, existingArchitecture);

  return ok({
    response: result.response,
    architecture: result.architecture,
  });
}

async function getConversation(userId: string, projectId: string): Promise<APIGatewayProxyResult> {
  const history = await getConversationHistory(userId, projectId);

  return ok({
    projectId,
    messages: history,
  });
}
