import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
  QueryCommand,
  UpdateCommand,
  DeleteCommand,
} from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({});
export const docClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: { removeUndefinedValues: true },
});

export async function putItem(tableName: string, item: Record<string, unknown>): Promise<void> {
  await docClient.send(new PutCommand({ TableName: tableName, Item: item }));
}

export async function getItem<T>(
  tableName: string,
  key: Record<string, string>,
): Promise<T | null> {
  const res = await docClient.send(new GetCommand({ TableName: tableName, Key: key }));
  return (res.Item as T) ?? null;
}

export async function queryItems<T>(
  tableName: string,
  keyCondition: string,
  expressionValues: Record<string, unknown>,
  options?: { scanForward?: boolean; limit?: number; indexName?: string },
): Promise<T[]> {
  const res = await docClient.send(
    new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: keyCondition,
      ExpressionAttributeValues: expressionValues,
      ScanIndexForward: options?.scanForward ?? true,
      Limit: options?.limit,
      IndexName: options?.indexName,
    }),
  );
  return (res.Items as T[]) ?? [];
}

export async function updateItem(
  tableName: string,
  key: Record<string, string>,
  updateExpression: string,
  expressionValues: Record<string, unknown>,
): Promise<void> {
  await docClient.send(
    new UpdateCommand({
      TableName: tableName,
      Key: key,
      UpdateExpression: updateExpression,
      ExpressionAttributeValues: expressionValues,
    }),
  );
}

export async function deleteItem(
  tableName: string,
  key: Record<string, string>,
): Promise<void> {
  await docClient.send(new DeleteCommand({ TableName: tableName, Key: key }));
}
