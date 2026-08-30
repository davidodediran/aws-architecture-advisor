import {
  BedrockAgentRuntimeClient,
  RetrieveCommand,
} from '@aws-sdk/client-bedrock-agent-runtime';

const client = new BedrockAgentRuntimeClient({});
const KNOWLEDGE_BASE_ID = process.env.KNOWLEDGE_BASE_ID ?? '';
const MIN_RELEVANCE_SCORE = 0.5;

export interface RetrievedContext {
  content: string;
  sourceUri: string;
  score: number;
}

export async function retrieveContext(query: string): Promise<RetrievedContext[]> {
  if (!KNOWLEDGE_BASE_ID) return [];

  try {
    const res = await client.send(
      new RetrieveCommand({
        knowledgeBaseId: KNOWLEDGE_BASE_ID,
        retrievalQuery: { text: query },
        retrievalConfiguration: {
          vectorSearchConfiguration: { numberOfResults: 5 },
        },
      }),
    );

    return (res.retrievalResults ?? [])
      .filter((r) => (r.score ?? 0) >= MIN_RELEVANCE_SCORE)
      .map((r) => ({
        content: r.content?.text ?? '',
        sourceUri: r.location?.s3Location?.uri ?? '',
        score: r.score ?? 0,
      }));
  } catch (err) {
    console.error('Knowledge base retrieval error:', err);
    return [];
  }
}

export function formatContextForPrompt(contexts: RetrievedContext[]): string {
  if (contexts.length === 0) return '';

  const contextBlocks = contexts
    .map(
      (ctx, i) =>
        `[Reference ${i + 1}] (relevance: ${ctx.score.toFixed(2)})\n${ctx.content}\nSource: ${ctx.sourceUri}`,
    )
    .join('\n\n');

  return `\n\nRelevant AWS Well-Architected Framework guidance:\n${contextBlocks}`;
}
