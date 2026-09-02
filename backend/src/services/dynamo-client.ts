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
const docClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: { removeUndefinedValues: true },
});

export async function putItem(tableName: string, item: Record<string, unknown>): Promise<void> {
  await docClient.send(new PutCommand({ TableName: tableName, Item: item }));
}

export async function getItem<T>(tableName: string, key: Record<string, string>): Promise<T | null> {
  const res = await docClient.send(new GetCommand({ TableName: tableName, Key: key }));
  return (res.Item as T) ?? null;
}

export async function queryItems<T>(
  tableName: string,
  keyCondition: string,
  expressionValues: Record<string, unknown>,
  options?: {
    indexName?: string;
    limit?: number;
    filterExpression?: string;
    scanForward?: boolean;
  },
): Promise<T[]> {
  const res = await docClient.send(
    new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: keyCondition,
      ExpressionAttributeValues: expressionValues,
      IndexName: options?.indexName,
      Limit: options?.limit,
      FilterExpression: options?.filterExpression,
      ScanIndexForward: options?.scanForward ?? true,
    }),
  );
  return (res.Items as T[]) ?? [];
}

export async function updateItem(
  tableName: string,
  key: Record<string, string>,
  updateExpression: string,
  expressionValues: Record<string, unknown>,
  expressionNames?: Record<string, string>,
): Promise<void> {
  await docClient.send(
    new UpdateCommand({
      TableName: tableName,
      Key: key,
      UpdateExpression: updateExpression,
      ExpressionAttributeValues: expressionValues,
      ExpressionAttributeNames: expressionNames,
    }),
  );
}

export async function deleteItem(tableName: string, key: Record<string, string>): Promise<void> {
  await docClient.send(new DeleteCommand({ TableName: tableName, Key: key }));
}
