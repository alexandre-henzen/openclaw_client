import type { Message as CopilotMessage } from '@copilotkit/shared';
import type { Message as LegacyMessage } from '../../../entities/message/api';

export function legacyMessagesToCopilot(
  items: LegacyMessage[] | null | undefined
): CopilotMessage[] {
  // Poll responses may omit `items`; an undefined list must not crash the
  // chat tree (this unmounts the whole CopilotKit surface without a boundary).
  return (items ?? [])
    .filter((m) => Boolean(m.text?.trim()))
    .map((m) => ({
      id: String(m._id),
      role: m.role,
      content: m.text.trim(),
    }));
}
