import type { AguiEvent } from '../agui/event-parser';
import type { VisualArtifact } from '../../@types/copilot';
import {
  protocolForSandboxOutput,
  resolveOutputMime,
} from '../artifacts/mime-policy';
import { persistVisualArtifact, storeSandboxFilePayload } from '../artifacts/artifact-persist';
import { logEvent } from '../logging';
import { parseRunCodeResultPayload, type PluginSandboxExecResult } from './run-code-payload';

const TOOL_NAME = 'run_code';

function toolNameFromStart(data: Record<string, unknown>): string | null {
  if (typeof data.toolCallName === 'string') return data.toolCallName;
  if (typeof data.tool_call_name === 'string') return data.tool_call_name;
  if (typeof data.name === 'string') return data.name;
  if (typeof data.toolName === 'string') return data.toolName;
  if (typeof data.tool === 'string') return data.tool;
  return null;
}

export class RunCodeObserver {
  private readonly toolNames = new Map<string, string>();

  constructor(private readonly conversationId: number) {}

  observe(ev: AguiEvent): string | null {
    if (!ev.data || typeof ev.data !== 'object') return null;
    const data = ev.data as Record<string, unknown>;

    if (ev.type === 'TOOL_CALL_START' || ev.type === 'tool.call.start') {
      const id =
        typeof data.toolCallId === 'string'
          ? data.toolCallId
          : typeof data.id === 'string'
            ? data.id
            : null;
      const name = toolNameFromStart(data);
      if (id && name) this.toolNames.set(id, name);
      return null;
    }

    if (ev.type === 'TOOL_CALL_RESULT' || ev.type === 'tool.call.result') {
      const id =
        typeof data.toolCallId === 'string'
          ? data.toolCallId
          : typeof data.id === 'string'
            ? data.id
            : null;
      if (!id) return null;
      const name =
        this.toolNames.get(id) ??
        toolNameFromStart(data) ??
        (typeof data.toolCallName === 'string' ? data.toolCallName : null);
      if (name !== TOOL_NAME) return null;

      const payload = parseRunCodeResultPayload(data);
      if (!payload) return null;

      void this.surfaceArtifacts(payload, payload.runId).catch((err) => {
        logEvent({
          event: 'sandbox.run.persist_error',
          level: 'warn',
          conversationId: this.conversationId,
          error: String(err),
        });
      });
      return payload.runId;
    }

    return null;
  }

  private async surfaceArtifacts(payload: PluginSandboxExecResult, runId: string): Promise<void> {
    const created: number[] = [];
    const files = payload.files ?? payload.outputs ?? [];

    for (let i = 0; i < files.length; i++) {
      const f = files[i]!;
      const resolvedMime = resolveOutputMime(f.mimeType, f.path);
      const protocol = protocolForSandboxOutput(f.mimeType, f.path);
      if (protocol === null) continue;

      const hasPayload =
        typeof f.text === 'string' || typeof f.contentBase64 === 'string';

      let storageRef: string | undefined;
      let contentHash: string | undefined;

      if (hasPayload) {
        const stored = storeSandboxFilePayload(f);
        if (!stored) continue;
        storageRef = stored.storageRef;
        contentHash = stored.contentHash;
      } else if (protocol !== 'download') {
        continue;
      }

      const downloadAvailable = Boolean(storageRef);

      const artifact: VisualArtifact = {
        kind: 'openclaw.visual_artifact.v1',
        artifactId: `${runId}__${i}`,
        protocol,
        title: f.path,
        mimeType: resolvedMime,
        metadata: {
          source: 'run_code',
          runId,
          path: f.path,
          sizeBytes: f.sizeBytes,
          contentHash: f.contentHash,
          downloadAvailable,
        },
      };

      const rowId = await persistVisualArtifact(this.conversationId, runId, artifact, {
        storageRef,
        contentHash,
        skipInlinePayload: true,
      });
      if (rowId) created.push(rowId);
    }

    logEvent({
      event: 'sandbox.run.persisted',
      conversationId: this.conversationId,
      runId,
      artifactCount: created.length,
      fileCount: files.length,
    });

  }
}
