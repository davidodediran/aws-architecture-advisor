import {
  BedrockRuntimeClient,
  InvokeModelCommand,
  InvokeModelWithResponseStreamCommand,
} from '@aws-sdk/client-bedrock-runtime';

const client = new BedrockRuntimeClient({});
const MODEL_ID = process.env.BEDROCK_MODEL_ID ?? 'anthropic.claude-3-sonnet-20240229-v1:0';
const MAX_RETRIES = 3;

function buildBody(prompt: string, systemPrompt?: string, maxTokens = 4096): string {
  return JSON.stringify({
    anthropic_version: 'bedrock-2023-05-31',
    max_tokens: maxTokens,
    system: systemPrompt ?? '',
    messages: [{ role: 'user', content: prompt }],
  });
}

export async function invokeModel(prompt: string, systemPrompt?: string, maxTokens = 4096): Promise<string> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const res = await client.send(
        new InvokeModelCommand({
          modelId: MODEL_ID,
          contentType: 'application/json',
          accept: 'application/json',
          body: buildBody(prompt, systemPrompt, maxTokens),
        }),
      );

      const parsed = JSON.parse(new TextDecoder().decode(res.body));
      return parsed.content?.[0]?.text ?? '';
    } catch (err) {
      lastError = err as Error;
      if ((err as { name?: string }).name === 'ThrottlingException' && attempt < MAX_RETRIES - 1) {
        await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt)));
        continue;
      }
      throw err;
    }
  }

  throw lastError;
}

export async function* invokeModelStream(
  prompt: string,
  systemPrompt?: string,
  maxTokens = 4096,
): AsyncGenerator<string, void, undefined> {
  const res = await client.send(
    new InvokeModelWithResponseStreamCommand({
      modelId: MODEL_ID,
      contentType: 'application/json',
      accept: 'application/json',
      body: buildBody(prompt, systemPrompt, maxTokens),
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
