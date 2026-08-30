import {
  BedrockRuntimeClient,
  InvokeModelCommand,
  InvokeModelWithResponseStreamCommand,
} from '@aws-sdk/client-bedrock-runtime';

const client = new BedrockRuntimeClient({});

const MODEL_ID = process.env.BEDROCK_MODEL_ID ?? 'anthropic.claude-3-sonnet-20240229-v1:0';
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

interface InvokeOptions {
  systemPrompt: string;
  messages: Array<{ role: string; content: string }>;
  maxTokens?: number;
  temperature?: number;
}

function buildBody(options: InvokeOptions): string {
  return JSON.stringify({
    anthropic_version: 'bedrock-2023-05-31',
    max_tokens: options.maxTokens ?? 4096,
    temperature: options.temperature ?? 0.7,
    system: options.systemPrompt,
    messages: options.messages,
  });
}

export async function invokeModel(options: InvokeOptions): Promise<string> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const res = await client.send(
        new InvokeModelCommand({
          modelId: MODEL_ID,
          contentType: 'application/json',
          accept: 'application/json',
          body: buildBody(options),
        }),
      );

      const parsed = JSON.parse(new TextDecoder().decode(res.body));
      return parsed.content?.[0]?.text ?? '';
    } catch (err) {
      lastError = err as Error;
      if ((err as { name?: string }).name === 'ThrottlingException' && attempt < MAX_RETRIES - 1) {
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * (attempt + 1)));
        continue;
      }
      throw err;
    }
  }

  throw lastError;
}

export async function* invokeModelStream(
  options: InvokeOptions,
): AsyncGenerator<string, void, undefined> {
  const res = await client.send(
    new InvokeModelWithResponseStreamCommand({
      modelId: MODEL_ID,
      contentType: 'application/json',
      accept: 'application/json',
      body: buildBody(options),
    }),
  );

  if (!res.body) return;

  for await (const event of res.body) {
    if (event.chunk?.bytes) {
      const parsed = JSON.parse(new TextDecoder().decode(event.chunk.bytes));
      if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
        yield parsed.delta.text;
      }
    }
  }
}
