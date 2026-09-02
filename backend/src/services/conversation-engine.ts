import type { ArchitectureModel } from '@aws-arch-advisor/shared';
import { invokeModel, invokeModelStream } from './bedrock-client';
import { retrieveContext, formatContextForPrompt } from './knowledge-base';
import { buildSystemPrompt } from '../prompts/system-prompt';
import { putItem, queryItems } from './dynamo-client';

const CONVERSATIONS_TABLE = process.env.CONVERSATIONS_TABLE!;
const ARCHITECTURE_VERSIONS_TABLE = process.env.ARCHITECTURE_VERSIONS_TABLE!;

interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

interface ProcessResult {
  response: string;
  architecture?: ArchitectureModel;
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
  userId: string,
  projectId: string,
  message: string,
  existingArchitecture?: ArchitectureModel,
): Promise<ProcessResult> {
  const history = await getConversationHistory(userId, projectId);

  const ragContexts = await retrieveContext(message);
  const ragPrompt = formatContextForPrompt(ragContexts);
  const systemPrompt = buildSystemPrompt(ragPrompt, existingArchitecture ? JSON.stringify(existingArchitecture, null, 2) : undefined);

  const messages = [
    ...history.map((m) => ({ role: m.role, content: m.content })),
    { role: 'user' as const, content: message },
  ];

  const response = await invokeModel({ systemPrompt, messages });

  const now = new Date().toISOString();
  await putItem(CONVERSATIONS_TABLE, {
    pk: `USER#${userId}#PROJECT#${projectId}`,
    sk: `MSG#${now}#user`,
    role: 'user',
    content: message,
    timestamp: now,
  });

  await putItem(CONVERSATIONS_TABLE, {
    pk: `USER#${userId}#PROJECT#${projectId}`,
    sk: `MSG#${now}#assistant`,
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
  userId: string,
  projectId: string,
  message: string,
  existingArchitecture?: ArchitectureModel,
): AsyncGenerator<{ type: string; content?: string; architecture?: ArchitectureModel }> {
  const history = await getConversationHistory(userId, projectId);

  const ragContexts = await retrieveContext(message);
  const ragPrompt = formatContextForPrompt(ragContexts);
  const systemPrompt = buildSystemPrompt(ragPrompt, existingArchitecture ? JSON.stringify(existingArchitecture, null, 2) : undefined);

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
  await putItem(CONVERSATIONS_TABLE, {
    pk: `USER#${userId}#PROJECT#${projectId}`,
    sk: `MSG#${now}#user`,
    role: 'user',
    content: message,
    timestamp: now,
  });

  await putItem(CONVERSATIONS_TABLE, {
    pk: `USER#${userId}#PROJECT#${projectId}`,
    sk: `MSG#${now}#assistant`,
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
  userId: string,
  projectId: string,
): Promise<ConversationMessage[]> {
  const items = await queryItems<ConversationMessage>(
    CONVERSATIONS_TABLE,
    'pk = :pk',
    { ':pk': `USER#${userId}#PROJECT#${projectId}` },
    { scanForward: true, limit: 50 },
  );
  return items;
}
