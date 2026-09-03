import {
  BedrockAgentRuntimeClient,
  RetrieveCommand,
} from '@aws-sdk/client-bedrock-agent-runtime';

const KNOWLEDGE_BASE_ID = process.env.KNOWLEDGE_BASE_ID ?? '';
const MIN_RELEVANCE_SCORE = 0.5;
const MAX_RESULTS = 5;

const client = new BedrockAgentRuntimeClient({});

export interface RetrievedContext {
  content: string;
  sourceUri: string;
  score: number;
}

export async function retrieveContext(query: string): Promise<RetrievedContext[]> {
  if (!KNOWLEDGE_BASE_ID) {
    console.warn('KNOWLEDGE_BASE_ID not set — skipping Knowledge Base retrieval');
    return [];
  }

  const response = await client.send(
    new RetrieveCommand({
      knowledgeBaseId: KNOWLEDGE_BASE_ID,
      retrievalQuery: { text: query },
      retrievalConfiguration: {
        vectorSearchConfiguration: {
          numberOfResults: MAX_RESULTS,
        },
      },
    }),
  );

  const results: RetrievedContext[] = [];

  for (const result of response.retrievalResults ?? []) {
    const score = result.score ?? 0;
    if (score < MIN_RELEVANCE_SCORE) continue;

    const content = result.content?.text ?? '';
    const sourceUri = result.location?.s3Location?.uri ?? '';

    if (content) {
      results.push({ content, sourceUri, score });
    }
  }

  return results.slice(0, MAX_RESULTS);
}

export function formatContextForPrompt(contexts: RetrievedContext[]): string {
  if (contexts.length === 0) return '';

  const sections = contexts.map(
    (ctx, i) =>
      `[Source ${i + 1}: ${ctx.sourceUri} (relevance: ${ctx.score.toFixed(2)})]\n${ctx.content}`,
  );

  return `\n\n## AWS Well-Architected Framework Reference\n\n${sections.join('\n\n')}`;
}
