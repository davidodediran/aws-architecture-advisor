import type { APIGatewayProxyResult } from 'aws-lambda';

const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN ?? '*';

const corsHeaders = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
  'Content-Type': 'application/json',
};

function response(statusCode: number, body: unknown): APIGatewayProxyResult {
  return { statusCode, headers: corsHeaders, body: JSON.stringify(body) };
}

export function ok(body: unknown): APIGatewayProxyResult {
  return response(200, body);
}

export function created(body: unknown): APIGatewayProxyResult {
  return response(201, body);
}

export function badRequest(message: string, details?: Record<string, unknown>): APIGatewayProxyResult {
  return response(400, { code: 'BAD_REQUEST', message, details });
}

export function notFound(message: string): APIGatewayProxyResult {
  return response(404, { code: 'NOT_FOUND', message });
}

export function forbidden(message: string): APIGatewayProxyResult {
  return response(403, { code: 'FORBIDDEN', message });
}

export function tooManyRequests(): APIGatewayProxyResult {
  return response(429, { code: 'TOO_MANY_REQUESTS', message: 'Rate limit exceeded. Please try again later.' });
}

export function serverError(): APIGatewayProxyResult {
  return response(500, { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' });
}
