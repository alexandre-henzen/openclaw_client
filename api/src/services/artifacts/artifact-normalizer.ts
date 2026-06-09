import type { VisualArtifact, VisualArtifactProtocol } from '../../@types/copilot';

type AnyObj = Record<string, unknown>;

function isObj(v: unknown): v is AnyObj {
  return typeof v === 'object' && v !== null;
}

function detectProtocol(
  mime: string | undefined,
  hasHtml: boolean,
  hasA2ui: boolean,
  hasMarkdown: boolean
): VisualArtifactProtocol {
  if (mime?.includes('skybridge')) return 'mcp-app';
  if (mime?.startsWith('ui://')) return 'mcp-app';
  if (hasA2ui) return 'a2ui';
  if (hasHtml || mime === 'text/html') return 'html-sandbox';
  if (hasMarkdown || mime === 'text/markdown') return 'markdown';
  return 'unknown';
}

export function normalizeArtifact(
  payload: unknown,
  opts: { artifactIdFallback: string }
): VisualArtifact | null {
  if (!isObj(payload)) return null;

  if (payload.kind === 'openclaw.visual_artifact.v1') {
    return payload as VisualArtifact;
  }

  if (Array.isArray(payload.content)) {
    for (const entry of payload.content) {
      if (!isObj(entry)) continue;
      if (entry.type === 'resource' && isObj(entry.resource)) {
        const r = entry.resource as AnyObj;
        const uri = typeof r.uri === 'string' ? r.uri : undefined;
        const mime = typeof r.mimeType === 'string' ? r.mimeType : undefined;
        const text = typeof r.text === 'string' ? r.text : undefined;
        const protocol = detectProtocol(mime, !!text && (mime?.includes('html') ?? false), false, false);
        return {
          kind: 'openclaw.visual_artifact.v1',
          artifactId: opts.artifactIdFallback,
          protocol,
          mimeType: mime,
          resourceUri: uri,
          title: uri?.replace(/^.*\//, '') ?? opts.artifactIdFallback,
          html: protocol === 'html-sandbox' || protocol === 'mcp-app' ? text : undefined,
        };
      }
    }
  }

  if (typeof payload.html === 'string') {
    return {
      kind: 'openclaw.visual_artifact.v1',
      artifactId: opts.artifactIdFallback,
      protocol: 'html-sandbox',
      mimeType: 'text/html',
      html: payload.html,
      title: typeof payload.title === 'string' ? payload.title : undefined,
    };
  }

  if (typeof payload.markdown === 'string') {
    return {
      kind: 'openclaw.visual_artifact.v1',
      artifactId: opts.artifactIdFallback,
      protocol: 'markdown',
      mimeType: 'text/markdown',
      markdown: payload.markdown,
      title: typeof payload.title === 'string' ? payload.title : undefined,
    };
  }

  if (isObj(payload.a2ui)) {
    return {
      kind: 'openclaw.visual_artifact.v1',
      artifactId: opts.artifactIdFallback,
      protocol: 'a2ui',
      a2ui: payload.a2ui,
      title: typeof payload.title === 'string' ? payload.title : undefined,
    };
  }

  return null;
}
