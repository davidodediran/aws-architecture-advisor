import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { putItem, deleteItem, getItem } from '../../services/dynamo-client';
import { ApiGatewayManagementApiClient, PostToConnectionCommand } from '@aws-sdk/client-apigatewaymanagementapi';

const CONNECTIONS_TABLE = process.env.CONNECTIONS_TABLE!;

interface ConnectionRecord {
  pk: string;
  sk: string;
  connectionId: string;
  userId: string;
  connectedAt: string;
  ttl: number;
}

function getManagementClient(event: APIGatewayProxyEvent): ApiGatewayManagementApiClient {
  const domain = event.requestContext.domainName;
  const stage = event.requestContext.stage;
  return new ApiGatewayManagementApiClient({
    endpoint: `https://${domain}/${stage}`,
  });
}

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const routeKey = event.requestContext.routeKey;

  try {
    switch (routeKey) {
      case '$connect':
        return handleConnect(event);
      case '$disconnect':
        return handleDisconnect(event);
      case 'sendMessage':
        return handleSendMessage(event);
      default:
        return { statusCode: 400, body: JSON.stringify({ message: 'Unknown route' }) };
    }
  } catch (err) {
    console.error('WebSocket handler error:', err);
    return { statusCode: 500, body: JSON.stringify({ message: 'Internal server error' }) };
  }
}

async function handleConnect(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const connectionId = event.requestContext.connectionId!;
  const userId = event.requestContext.authorizer?.userId ?? 'anonymous';
  const ttlHours = 2;

  const record: ConnectionRecord = {
    pk: `CONN#${connectionId}`,
    sk: 'meta',
    connectionId,
    userId,
    connectedAt: new Date().toISOString(),
    ttl: Math.floor(Date.now() / 1000) + ttlHours * 3600,
  };

  await putItem(CONNECTIONS_TABLE, record);

  return { statusCode: 200, body: 'Connected' };
}

async function handleDisconnect(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const connectionId = event.requestContext.connectionId!;

  await deleteItem(CONNECTIONS_TABLE, {
    pk: `CONN#${connectionId}`,
    sk: 'meta',
  });

  return { statusCode: 200, body: 'Disconnected' };
}

async function handleSendMessage(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const connectionId = event.requestContext.connectionId!;
  const body = JSON.parse(event.body ?? '{}');
  const { projectId, message } = body;

  if (!projectId || !message) {
    return { statusCode: 400, body: JSON.stringify({ error: 'projectId and message are required' }) };
  }

  const conn = await getItem<ConnectionRecord>(CONNECTIONS_TABLE, {
    pk: `CONN#${connectionId}`,
    sk: 'meta',
  });

  if (!conn) {
    return { statusCode: 403, body: JSON.stringify({ error: 'Connection not found' }) };
  }

  const client = getManagementClient(event);
  const { processMessage } = await import('../../services/conversation-engine');

  const streamCallback = async (chunk: string) => {
    await client.send(new PostToConnectionCommand({
      ConnectionId: connectionId,
      Data: new TextEncoder().encode(JSON.stringify({ type: 'chunk', data: chunk })),
    }));
  };

  try {
    const result = await processMessage(conn.userId, projectId, message, undefined, streamCallback);

    await client.send(new PostToConnectionCommand({
      ConnectionId: connectionId,
      Data: new TextEncoder().encode(JSON.stringify({
        type: 'complete',
        data: {
          response: result.response,
          architecture: result.architecture,
        },
      })),
    }));
  } catch (err) {
    await client.send(new PostToConnectionCommand({
      ConnectionId: connectionId,
      Data: new TextEncoder().encode(JSON.stringify({ type: 'error', error: 'Failed to process message' })),
    }));
  }

  return { statusCode: 200, body: 'Message sent' };
}
