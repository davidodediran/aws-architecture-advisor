import type { ArchitectureModel } from '@aws-arch-advisor/shared';
import { invokeModel, invokeModelStream } from './bedrock-client';
import { retrieveContext, formatContextForPrompt } from './knowledge-base';
import { buildSystemPrompt } from '../prompts/system-prompt';
import { putItem, queryItems } from './dynamo-client';

const CONVERSATIONS_TABLE = process.env.CONVERSATIONS_TABLE!;
const ARCHITECTURE_VERSIONS_TABLE = process.env.ARCHITECTURE_VERSIONS_TABLE!;

interface ConversationTurn {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

interface ProcessResult {
  response: string;
  architecture?: ArchitectureModel;
}

function generateUlid(): string {
  const timestamp = Date.now().toString(36).padStart(10, '0');
  const random = Array.from({ length: 16 }, () =>
    Math.floor(Math.random() * 36).toString(36),
  ).join('');
  return `${timestamp}${random}`.toUpperCase();
}

function extractArchitectureJson(text: string): ArchitectureModel | null {
  const jsonMatch = text.match(/```json\s*([\s\S]*?)```/);
  if (!jsonMatch) return null;

  try {
    const parsed = JSON.parse(jsonMatch[1]);
    if (parsed.schemaVersion && parsed.resources) return parsed as ArchitectureModel;
  } catch {
    // not valid JSON
  }
  return null;
}

export async function processMessage(
  projectId: string,
  userId: string,
  message: string,
  existingArchitecture?: ArchitectureModel,
): Promise<ProcessResult> {
  const ragContexts = await retrieveContext(message);
  const ragPrompt = formatContextForPrompt(ragContexts);
  const systemPrompt = buildSystemPrompt(ragPrompt, existingArchitecture);

  const history = await getConversationHistory(projectId);
  const messages = [
    ...history.map((m) => ({ role: m.role, content: m.content })),
    { role: 'user' as const, content: message },
  ];

  const response = await invokeModel({ systemPrompt, messages });

  const now = new Date().toISOString();
  const turnId = generateUlid();

  await putItem(CONVERSATIONS_TABLE, {
    pk: `CONV#${projectId}`,
    sk: `TURN#${turnId}`,
    userId,
    userMessage: message,
    assistantMessage: response,
    role: 'user',
    content: message,
    timestamp: now,
  });

  const assistantTurnId = generateUlid();
  await putItem(CONVERSATIONS_TABLE, {
    pk: `CONV#${projectId}`,
    sk: `TURN#${assistantTurnId}`,
    userId,
    role: 'assistant',
    content: response,
    timestamp: now,
  });

  const architecture = extractArchitectureJson(response);

  if (architecture) {
    const versionId = `v-${Date.now()}`;
    await putItem(ARCHITECTURE_VERSIONS_TABLE, {
      pk: `PROJECT#${projectId}`,
      sk: `VERSION#${versionId}`,
      versionId,
      architecture,
      createdAt: now,
      createdBy: userId,
    });
  }

  return { response, architecture: architecture ?? undefined };
}

export async function* streamMessage(
  projectId: string,
  userId: string,
  message: string,
  existingArchitecture?: ArchitectureModel,
): AsyncGenerator<{ type: string; content?: string; architecture?: ArchitectureModel }> {
  const ragContexts = await retrieveContext(message);
  const ragPrompt = formatContextForPrompt(ragContexts);
  const systemPrompt = buildSystemPrompt(ragPrompt, existingArchitecture);

  const history = await getConversationHistory(projectId);
  const messages = [
    ...history.map((m) => ({ role: m.role, content: m.content })),
    { role: 'user' as const, content: message },
  ];

  let fullResponse = '';
  for await (const chunk of invokeModelStream({ systemPrompt, messages })) {
    fullResponse += chunk;
    yield { type: 'chunk', content: chunk };
  }

  const now = new Date().toISOString();
  const userTurnId = generateUlid();

  await putItem(CONVERSATIONS_TABLE, {
    pk: `CONV#${projectId}`,
    sk: `TURN#${userTurnId}`,
    userId,
    role: 'user',
    content: message,
    timestamp: now,
  });

  const assistantTurnId = generateUlid();
  await putItem(CONVERSATIONS_TABLE, {
    pk: `CONV#${projectId}`,
    sk: `TURN#${assistantTurnId}`,
    userId,
    role: 'assistant',
    content: fullResponse,
    timestamp: now,
  });

  const architecture = extractArchitectureJson(fullResponse);
  if (architecture) {
    const versionId = `v-${Date.now()}`;
    await putItem(ARCHITECTURE_VERSIONS_TABLE, {
      pk: `PROJECT#${projectId}`,
      sk: `VERSION#${versionId}`,
      versionId,
      architecture,
      createdAt: now,
      createdBy: userId,
    });
    yield { type: 'architecture', architecture };
  }

  yield { type: 'done' };
}

export async function getConversationHistory(
  projectId: string,
): Promise<ConversationTurn[]> {
  const items = await queryItems<ConversationTurn & { pk: string; sk: string }>(
    CONVERSATIONS_TABLE,
    'pk = :pk',
    { ':pk': `CONV#${projectId}` },
    { scanForward: true, limit: 50 },
  );
  return items.map((item) => ({
    role: item.role,
    content: item.content,
    timestamp: item.timestamp,
  }));
}
