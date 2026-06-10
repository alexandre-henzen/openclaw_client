import { ulid } from 'ulid';

import { Readable } from 'stream';

import AppDataSource from '../../data-source';

import { AguiEvent, CopilotRun } from '../../entities';

import type { ChatSessionRecord, GatewayProfileRecord } from '../../@types/copilot';

import { buildClawgUiHeaders } from '../openclaw/clawg-headers';

import { RunCodeObserver } from '../openclaw/run-code-observer';

import { parseRunCodeResultPayload } from '../openclaw/run-code-payload';

import { parseAguiNodeStream, type AguiEvent as ParsedEvent } from './event-parser';

import { normalizeArtifact } from '../artifacts/artifact-normalizer';

import { persistVisualArtifact } from '../artifacts/artifact-persist';

import {
  assistantTextHasBrokenMedia,
  sanitizeAssistantMediaText,
} from '../artifacts/sanitize-media-text';

import { logEvent } from '../logging';

import {

  setConversationStatus,

  touchConversationLastMessage,

} from '../conversationSessionService';



const activeAborts = new Map<string, AbortController>();



const SANDBOX_SYSTEM_DIRECTIVE = [

  'SANDBOX EXECUTION POLICY — strict:',

  'Tool `run_code` (openclaw-run-code-sandbox, E2B/Piston) is the ONLY surface for: charts, dashboards (HTML), data-analysis scripts, and user-visible files (CSV, HTML tables, exports). Files reach the artifact tray via `emit_file`/`emitFile` and ### FILE: markers — not via workspace write.',

  'Forbidden for those deliverables: `write`, `write_file`, `exec`, `canvas`, `nodes`.',

  'HTML/SVG must be self-contained (inline only, no CDN/network).',

  'Synthetic demo data only when the user explicitly asks; label "dados simulados" in the artifact.',

].join('\n');



export function abortRun(runId: string): boolean {

  const ctrl = activeAborts.get(runId);

  if (!ctrl) return false;

  ctrl.abort();

  activeAborts.delete(runId);

  return true;

}



async function appendEvent(

  conversationId: number,

  runId: string,

  seq: number,

  ev: ParsedEvent

): Promise<void> {

  const repo = AppDataSource.getRepository(AguiEvent);

  await repo.save(

    repo.create({

      conversationId,

      runId,

      seq,

      eventType: ev.type,

      eventJson: ev.data,

    })

  );

}



async function startRun(conversationId: number, runId: string): Promise<void> {

  const repo = AppDataSource.getRepository(CopilotRun);

  await repo.save(

    repo.create({

      conversationId,

      runId,

      status: 'started',

      startedAt: new Date(),

    })

  );

}



async function finishRun(conversationId: number, runId: string, status: string): Promise<void> {

  const repo = AppDataSource.getRepository(CopilotRun);

  const row = await repo.findOne({ where: { conversationId, runId } });

  if (!row) return;

  row.status = status;

  row.finishedAt = new Date();

  await repo.save(row);

}



function handleSideEffects(

  ev: ParsedEvent,

  conversationId: number,

  runId: string

): void {

  if (!ev.data || typeof ev.data !== 'object') return;

  const data = ev.data as Record<string, unknown>;



  if (ev.type === 'TOOL_CALL_RESULT' || ev.type === 'tool.call.result') {

    if (parseRunCodeResultPayload(data)) return;



    const toolCallId =

      typeof data.toolCallId === 'string' ? data.toolCallId : `tc_${runId}_${Date.now()}`;

    const result = data.result ?? data.output ?? data;

    const artifact = normalizeArtifact(result, { artifactIdFallback: toolCallId });

    if (artifact) {

      persistVisualArtifact(conversationId, runId, artifact, { skipInlinePayload: true }).catch(

        (err) => {

          logEvent({ event: 'artifact.persist_error', level: 'warn', error: String(err) });

        }

      );

    }

  }

}



function amendMediaFailedHint(ev: ParsedEvent): ParsedEvent {

  if (!ev.data || typeof ev.data !== 'object') return ev;

  if (ev.type !== 'TEXT_MESSAGE_END' && ev.type !== 'text.message.end') return ev;

  const data = ev.data as Record<string, unknown>;

  const text =

    typeof data.delta === 'string'

      ? data.delta

      : typeof data.text === 'string'

        ? data.text

        : '';

  if (!assistantTextHasBrokenMedia(text)) return ev;

  const cleaned = sanitizeAssistantMediaText(text);

  const suffix = cleaned.includes('abaixo desta mensagem')

    ? ''

    : '\n\n_O gráfico ou arquivo aparece logo abaixo desta mensagem._';

  const nextText = `${cleaned}${suffix}`.trim();

  const nextData = { ...data };

  if (typeof data.delta === 'string') nextData.delta = nextText;

  if (typeof data.text === 'string') nextData.text = nextText;

  return { ...ev, data: nextData };

}



function enforceRunCodeSandbox(input: Record<string, unknown>): void {

  if (Array.isArray(input.tools)) {

    input.tools = (input.tools as Record<string, unknown>[]).filter(

      (t) => !(t && typeof t === 'object' && t.name === 'run_code')

    );

  }



  const messages = Array.isArray(input.messages)

    ? (input.messages as Record<string, unknown>[])

    : [];

  const hasSandbox = messages.some(

    (m) =>

      m &&

      typeof m === 'object' &&

      m.role === 'system' &&

      typeof m.content === 'string' &&

      (m.content as string).startsWith('SANDBOX EXECUTION POLICY')

  );

  if (!hasSandbox) {

    messages.unshift({

      id: `sys_sandbox_${Date.now()}`,

      role: 'system',

      content: SANDBOX_SYSTEM_DIRECTIVE,

    });

  }

  input.messages = messages;



  const fwd = (input.forwardedProps as Record<string, unknown> | undefined) ?? {};

  fwd.sandboxPolicy = SANDBOX_SYSTEM_DIRECTIVE;

  fwd.preferredTool = 'run_code';

  fwd.disabledTools = ['write', 'write_file', 'exec', 'canvas', 'nodes'];

  input.forwardedProps = fwd;

}



export type ProxyOptions = {

  profile: GatewayProfileRecord;

  session: ChatSessionRecord;

  conversationId: number;

  input: Record<string, unknown>;

};



export async function proxyToClawgUi(opts: ProxyOptions): Promise<Response> {

  const { profile, session, conversationId } = opts;

  const runId =

    typeof opts.input.runId === 'string' && opts.input.runId.length > 0

      ? opts.input.runId

      : `run_${ulid()}`;



  const runAgentInput = {

    ...opts.input,

    threadId: session.threadId,

    runId,

    state: {

      ...((opts.input.state as Record<string, unknown> | undefined) ?? {}),

      openclawCopilot: { sessionId: session.id, agentId: session.agentId },

    },

  };



  enforceRunCodeSandbox(runAgentInput);



  const headers = buildClawgUiHeaders(profile, session);

  const abort = new AbortController();

  activeAborts.set(runId, abort);



  let upstream: globalThis.Response;

  try {

    upstream = await fetch(profile.clawgUiUrl, {

      method: 'POST',

      headers,

      body: JSON.stringify(runAgentInput),

      signal: abort.signal,

    });

  } catch {

    activeAborts.delete(runId);

    return new Response(JSON.stringify({ error: 'upstream_connect_failed' }), {

      status: 502,

      headers: { 'Content-Type': 'application/json' },

    });

  }



  if (!upstream.ok || !upstream.body) {

    activeAborts.delete(runId);

    const text = await upstream.text().catch(() => '');

    return new Response(

      JSON.stringify({ error: 'upstream_error', status: upstream.status, body: text.slice(0, 500) }),

      { status: 502, headers: { 'Content-Type': 'application/json' } }

    );

  }



  await startRun(conversationId, runId);

  await setConversationStatus(conversationId, 'running');



  const runCodeObserver = new RunCodeObserver(conversationId);



  let seq = 0;

  let finished = false;

  let errored = false;



  const nodeBody = Readable.fromWeb(upstream.body as import('stream/web').ReadableStream);

  const aguiStream = parseAguiNodeStream(nodeBody);



  const downstream = new ReadableStream<Uint8Array>({

    async start(controller) {

      const encoder = new TextEncoder();

      try {

        for await (const ev of aguiStream) {

          seq += 1;

          try {

            await appendEvent(conversationId, runId, seq, ev);

          } catch (err) {

            logEvent({ event: 'agui.event.persist_error', level: 'warn', error: String(err) });

          }

          handleSideEffects(ev, conversationId, runId);

          runCodeObserver.observe(ev);

          const outEv = amendMediaFailedHint(ev);

          const dataLine = `data: ${typeof outEv.data === 'string' ? outEv.data : JSON.stringify(outEv.data)}\n`;

          const eventLine = outEv.type ? `event: ${outEv.type}\n` : '';

          controller.enqueue(encoder.encode(`${eventLine}${dataLine}\n`));

          if (ev.type === 'RUN_FINISHED' || ev.type === 'run.finished') finished = true;

          if (ev.type === 'RUN_ERROR' || ev.type === 'run.error') errored = true;

        }

        controller.close();

      } catch (err) {

        errored = true;

        controller.error(err);

      } finally {

        activeAborts.delete(runId);

        if (errored) {

          await finishRun(conversationId, runId, 'error');

          await setConversationStatus(conversationId, 'error');

        } else if (finished) {

          await finishRun(conversationId, runId, 'finished');

          await setConversationStatus(conversationId, 'idle');

          await touchConversationLastMessage(conversationId);

        } else {

          await finishRun(conversationId, runId, 'aborted');

          await setConversationStatus(conversationId, 'idle');

        }

      }

    },

    cancel() {

      abort.abort();

      activeAborts.delete(runId);

    },

  });



  return new Response(downstream, {

    headers: {

      'Content-Type': 'text/event-stream',

      'Cache-Control': 'no-cache, no-transform',

      Connection: 'keep-alive',

      'X-Accel-Buffering': 'no',

    },

  });

}


