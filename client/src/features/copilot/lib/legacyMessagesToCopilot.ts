import type { Message as CopilotMessage } from '@copilotkit/shared';
import type { Message as LegacyMessage } from '../../../entities/message/api';

export function legacyMessagesToCopilot(items: LegacyMessage[]): CopilotMessage[] {
  return items
    .filter((m) => Boolean(m.text?.trim()))
    .map((m) => ({
      id: String(m._id),
      role: m.role,
      content: m.text.trim(),
    }));
}
