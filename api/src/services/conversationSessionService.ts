import { ulid } from 'ulid';
import AppDataSource from '../data-source';
import { Agent, Conversation } from '../entities';
import type { ChatSessionRecord } from '../@types/copilot';
import { buildUserScope } from './security/session-scope';

const DEFAULT_PROFILE = 'default';

export async function ensureConversationSession(
  conversationId: number,
  userId: number
): Promise<{ conversation: Conversation; agent: Agent; session: ChatSessionRecord }> {
  const convRepo = AppDataSource.getRepository(Conversation);
  const agentRepo = AppDataSource.getRepository(Agent);

  const conversation = await convRepo.findOneBy({ _id: conversationId });
  if (!conversation) throw new Error('conversation_not_found');

  const agent = await agentRepo.findOneBy({ _id: conversation.agentId });
  if (!agent?.openclawAgentId) throw new Error('agent_not_found');

  let changed = false;
  if (!conversation.threadId) {
    conversation.threadId = ulid();
    changed = true;
  }
  if (!conversation.userScope) {
    conversation.userScope = buildUserScope(String(userId));
    changed = true;
  }
  if (!conversation.sessionKey) {
    conversation.sessionKey = String(conversation._id);
    changed = true;
  }
  if (changed) {
    await convRepo.save(conversation);
  }

  return {
    conversation,
    agent,
    session: toChatSessionRecord(conversation, agent.openclawAgentId),
  };
}

export function toChatSessionRecord(
  conversation: Conversation,
  openclawAgentId: string
): ChatSessionRecord {
  return {
    id: String(conversation._id),
    gatewayProfileId: DEFAULT_PROFILE,
    agentId: openclawAgentId,
    title: conversation.title ?? `Conversation ${conversation._id}`,
    threadId: conversation.threadId!,
    openclawSessionKey: conversation.sessionKey ?? undefined,
    userScope: conversation.userScope!,
    status: (conversation.copilotStatus as ChatSessionRecord['status']) || 'idle',
    createdAt: conversation.createdAt.toISOString(),
    updatedAt: conversation.createdAt.toISOString(),
    lastMessageAt: conversation.lastMessageAt?.toISOString(),
  };
}

export async function setConversationStatus(
  conversationId: number,
  status: string
): Promise<void> {
  const repo = AppDataSource.getRepository(Conversation);
  await repo.update(conversationId, { copilotStatus: status });
}

export async function touchConversationLastMessage(conversationId: number): Promise<void> {
  const repo = AppDataSource.getRepository(Conversation);
  await repo.update(conversationId, { lastMessageAt: new Date() });
}
