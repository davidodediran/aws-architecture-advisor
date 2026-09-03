import { S3Client, GetObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';

const WA_DOCS_BUCKET = process.env.WA_DOCS_BUCKET ?? '';
const WA_DOCS_PREFIX = 'wa-framework/';
const MAX_RESULTS = 5;

const s3 = new S3Client({});

export interface RetrievedContext {
  content: string;
  sourceUri: string;
  score: number;
}

const PILLAR_KEYWORDS: Record<string, string[]> = {
  'operational-excellence': ['operational', 'operations', 'runbook', 'observability', 'deployment', 'monitoring'],
  'security': ['security', 'encryption', 'iam', 'access', 'authentication', 'authorization', 'compliance'],
  'reliability': ['reliability', 'fault', 'recovery', 'resilience', 'availability', 'failover', 'backup'],
  'performance-efficiency': ['performance', 'scaling', 'latency', 'throughput', 'caching', 'compute'],
  'cost-optimization': ['cost', 'pricing', 'budget', 'savings', 'reserved', 'spot', 'optimization'],
  'sustainability': ['sustainability', 'carbon', 'energy', 'efficient', 'environmental', 'green'],
};

function matchPillars(query: string): string[] {
  const lower = query.toLowerCase();
  const scored = Object.entries(PILLAR_KEYWORDS).map(([pillar, keywords]) => ({
    pillar,
    hits: keywords.filter((kw) => lower.includes(kw)).length,
  }));
  scored.sort((a, b) => b.hits - a.hits);
  const matched = scored.filter((s) => s.hits > 0).map((s) => s.pillar);
  return matched.length > 0 ? matched.slice(0, MAX_RESULTS) : Object.keys(PILLAR_KEYWORDS).slice(0, 3);
}

async function fetchDoc(key: string): Promise<string> {
  const result = await s3.send(
    new GetObjectCommand({ Bucket: WA_DOCS_BUCKET, Key: key }),
  );
  return (await result.Body?.transformToString()) ?? '';
}

export async function retrieveContext(query: string): Promise<RetrievedContext[]> {
  if (!WA_DOCS_BUCKET) {
    console.warn('WA_DOCS_BUCKET not set — skipping WA Framework retrieval');
    return [];
  }

  const pillars = matchPillars(query);
  const contexts: RetrievedContext[] = [];

  const listResult = await s3.send(
    new ListObjectsV2Command({
      Bucket: WA_DOCS_BUCKET,
      Prefix: WA_DOCS_PREFIX,
    }),
  );

  const allKeys = (listResult.Contents ?? []).map((obj) => obj.Key!).filter(Boolean);

  for (const pillar of pillars) {
    const matchingKeys = allKeys.filter((k) => k.includes(pillar));
    for (const key of matchingKeys.slice(0, 2)) {
      try {
        const content = await fetchDoc(key);
        if (content) {
          contexts.push({
            content: content.slice(0, 4000),
            sourceUri: `s3://${WA_DOCS_BUCKET}/${key}`,
            score: 1,
          });
        }
      } catch {
        console.warn(`Failed to fetch ${key}`);
      }
    }
  }

  return contexts.slice(0, MAX_RESULTS);
}

export function formatContextForPrompt(contexts: RetrievedContext[]): string {
  if (contexts.length === 0) return '';

  const sections = contexts.map(
    (ctx, i) =>
      `[Source ${i + 1}: ${ctx.sourceUri}]\n${ctx.content}`,
  );

  return `\n\n## AWS Well-Architected Framework Reference\n\n${sections.join('\n\n')}`;
}
