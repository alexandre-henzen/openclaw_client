import { Readable } from 'node:stream';
import { createParser, type EventSourceMessage, type EventSourceParser } from 'eventsource-parser';

export type AguiEvent = {
  type: string;
  raw: string;
  data: unknown;
  id?: string;
};

function eventTypeFromMessage(msg: EventSourceMessage, data: unknown): string {
  if (msg.event) return msg.event;
  if (
    typeof data === 'object' &&
    data !== null &&
    'type' in data &&
    typeof (data as { type: unknown }).type === 'string'
  ) {
    return (data as { type: string }).type;
  }
  return 'message';
}

function pushParsedEvent(queue: AguiEvent[], msg: EventSourceMessage): void {
  let data: unknown = msg.data;
  try {
    data = JSON.parse(msg.data);
  } catch {
    /* keep as string */
  }
  queue.push({
    type: eventTypeFromMessage(msg, data),
    raw: msg.data,
    data,
    id: msg.id,
  });
}

/**
 * Parse a complete SSE text buffer (used by fixture tests).
 */
export function parseAguiText(sseText: string): AguiEvent[] {
  const queue: AguiEvent[] = [];
  const parser: EventSourceParser = createParser({
    onEvent(msg: EventSourceMessage) {
      pushParsedEvent(queue, msg);
    },
  });
  parser.feed(sseText.endsWith('\n\n') ? sseText : `${sseText}\n\n`);
  return queue;
}

/**
 * Async generator yielding AG-UI SSE events from a Web ReadableStream.
 */
export async function* parseAguiStream(
  body: ReadableStream<Uint8Array>
): AsyncGenerator<AguiEvent> {
  const queue: AguiEvent[] = [];
  let done = false;
  let resolveNext: (() => void) | null = null as (() => void) | null;

  const parser: EventSourceParser = createParser({
    onEvent(msg: EventSourceMessage) {
      pushParsedEvent(queue, msg);
      if (resolveNext) {
        const r = resolveNext;
        resolveNext = null;
        r();
      }
    },
  });

  const reader = body.getReader();
  const decoder = new TextDecoder();

  (async () => {
    try {
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { value, done: rDone } = await reader.read();
        if (rDone) break;
        parser.feed(decoder.decode(value, { stream: true }));
      }
      // Flush a trailing event when the upstream closes without a final
      // blank line (same end-of-input semantics as parseAguiText).
      parser.feed('\n\n');
    } finally {
      done = true;
      if (resolveNext) {
        const r = resolveNext;
        resolveNext = null;
        r();
      }
    }
  })().catch(() => {
    done = true;
    if (resolveNext) {
      const r = resolveNext;
      resolveNext = null;
      r();
    }
  });

  while (!done || queue.length > 0) {
    if (queue.length > 0) {
      yield queue.shift()!;
      continue;
    }
    await new Promise<void>((res) => {
      resolveNext = () => res();
    });
  }
}

/** Node.js Readable → AG-UI events (for Express proxy responses). */
export async function* parseAguiNodeStream(stream: Readable): AsyncGenerator<AguiEvent> {
  const web = Readable.toWeb(stream) as ReadableStream<Uint8Array>;
  yield* parseAguiStream(web);
}
