import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { extractAuth } from '../../middleware/auth';
import { ok, badRequest, serverError } from '../../middleware/api-response';

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const auth = extractAuth(event);
    const method = event.httpMethod;
    const projectId = event.pathParameters?.projectId;

    if (method === 'POST') return sendMessage(auth.userId, event.body);
    if (method === 'GET' && projectId) return getConversation(auth.userId, projectId);

    return badRequest('Unsupported method');
  } catch {
    return serverError();
  }
}

async function sendMessage(_userId: string, body: string | null): Promise<APIGatewayProxyResult> {
  if (!body) return badRequest('Request body is required');

  // TODO: Parse body with Zod (SendMessageRequest)
  // TODO: Verify project ownership
  // TODO: Check daily Bedrock spend / circuit breaker
  // TODO: Load conversation history from DynamoDB
  // TODO: Build Bedrock prompt with system instructions
  // TODO: Invoke Bedrock (Claude via Converse API)
  // TODO: Check guardrail response (IP protection)
  // TODO: Parse architecture model updates from response
  // TODO: Save conversation turn to DynamoDB
  // TODO: If architecture updated, save new version
  // TODO: Return response

  return ok({
    conversationId: 'placeholder',
    response: 'Architecture advisor response placeholder',
    architectureUpdated: false,
    guardrailBlocked: false,
    tokensUsed: 0,
  });
}

async function getConversation(_userId: string, projectId: string): Promise<APIGatewayProxyResult> {
  // TODO: Query conversation from DynamoDB by projectId
  // TODO: Verify ownership

  return ok({ projectId, messages: [], tokenCount: 0 });
}
