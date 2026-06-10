import { describe, expect, it } from 'vitest';
import { legacyMessagesToCopilot } from './legacyMessagesToCopilot';
import type { Message as LegacyMessage } from '../../../entities/message/api';

function msg(partial: Partial<LegacyMessage>): LegacyMessage {
  return {
    _id: '1',
    text: 'hello',
    role: 'user',
    ...partial,
  } as LegacyMessage;
}

describe('legacyMessagesToCopilot', () => {
  it('maps id, role and trimmed content', () => {
    const out = legacyMessagesToCopilot([
      msg({ _id: '7', role: 'assistant', text: '  resposta  ' }),
    ]);
    expect(out).toEqual([{ id: '7', role: 'assistant', content: 'resposta' }]);
  });

  it('drops messages with empty or whitespace-only text', () => {
    const out = legacyMessagesToCopilot([
      msg({ _id: '1', text: '' }),
      msg({ _id: '2', text: '   ' }),
      msg({ _id: '3', text: undefined as unknown as string }),
      msg({ _id: '4', text: 'kept' }),
    ]);
    expect(out.map((m) => m.id)).toEqual(['4']);
  });

  it('preserves message order', () => {
    const out = legacyMessagesToCopilot([
      msg({ _id: '1', role: 'user', text: 'q' }),
      msg({ _id: '2', role: 'assistant', text: 'a' }),
    ]);
    expect(out.map((m) => m.id)).toEqual(['1', '2']);
  });

  it('returns an empty array for no input', () => {
    expect(legacyMessagesToCopilot([])).toEqual([]);
  });

  it('tolerates undefined/null payloads without crashing the chat tree', () => {
    expect(legacyMessagesToCopilot(undefined)).toEqual([]);
    expect(legacyMessagesToCopilot(null)).toEqual([]);
  });
});
