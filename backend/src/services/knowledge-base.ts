import {
  BedrockAgentRuntimeClient,
  RetrieveCommand,
} from '@aws-sdk/client-bedrock-agent-runtime';

const client = new BedrockAgentRuntimeClient({});
const KNOWLEDGE_BASE_ID = process.env.KNOWLEDGE_BASE_ID ?? '';

export interface RetrievedContext {
  content: string;
  sourceUri: string;
  score: number;
}

export async function retrieveContext(query: string, maxResults = 5): Promise<RetrievedContext[]> {
  if (!KNOWLEDGE_BASE_ID) return [];

  const res = await client.send(
    new RetrieveCommand({
      knowledgeBaseId: KNOWLEDGE_BASE_ID,
      retrievalQuery: { text: query },
      retrievalConfiguration: {
        vectorSearchConfiguration: { numberOfResults: maxResults },
      },
    }),
  );

  return (res.retrievalResults ?? [])
    .filter((r) => (r.score ?? 0) >= 0.5)
    .map((r) => ({
      content: r.content?.text ?? '',
      sourceUri: r.location?.s3Location?.uri ?? '',
      score: r.score ?? 0,
    }));
}

export function formatContextForPrompt(contexts: RetrievedContext[]): string {
  if (contexts.length === 0) return '';

  const lines = contexts.map(
    (ctx, i) => `${i + 1}. ${ctx.content}\n   Source: ${ctx.sourceUri}`,
  );

  return `## WA Framework Reference\n\n${lines.join('\n\n')}`;
}
