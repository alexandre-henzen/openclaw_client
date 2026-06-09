import { marked } from 'marked';
import type { VisualArtifact, VisualArtifactProtocol } from '../../@types/copilot';

const FRAME_STYLE = `body{margin:0;padding:16px;font:14px/1.55 system-ui,-apple-system,Segoe UI,sans-serif;color:#111;background:#fff}h1,h2,h3,h4{margin:.6em 0 .3em}p{margin:.5em 0}pre{margin:.5em 0;padding:12px;background:#0b0e14;color:#e6edf3;border-radius:6px;overflow:auto;font:12px/1.45 ui-monospace,Consolas,Monaco,monospace}code{background:#eef1f5;padding:1px 4px;border-radius:4px;font:12px/1.45 ui-monospace,Consolas,Monaco,monospace}pre code{background:transparent;padding:0}table{border-collapse:collapse;margin:.5em 0}th,td{border:1px solid #d0d7de;padding:4px 8px}th{background:#f6f8fa;text-align:left}blockquote{margin:.5em 0;padding:0 12px;border-left:3px solid #d0d7de;color:#555}img{max-width:100%;height:auto}.meta{color:#555;margin-bottom:8px;font-size:12px}.kv{display:grid;grid-template-columns:140px 1fr;gap:4px 12px;margin:0}.kv dt{font-weight:600;color:#555}.kv dd{margin:0;word-break:break-all}.card{border:1px solid #d0d7de;border-radius:8px;padding:12px;margin:8px 0;background:#fafbfc}.card h3{margin-top:0}.btn{display:inline-block;padding:6px 10px;border:1px solid #d0d7de;border-radius:6px;background:#f6f8fa;color:#111;text-decoration:none;font-size:13px;margin:4px 4px 4px 0}ul.a2-list{margin:.4em 0;padding-left:1.2em}.error{color:#a3262c;background:#ffeef0;border:1px solid #ffc9cc;padding:8px;border-radius:6px}`;

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function wrapFrame(title: string, inner: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>${FRAME_STYLE}</style></head><body>${inner}</body></html>`;
}

marked.setOptions({ gfm: true, breaks: false });

export function renderMarkdown(title: string, src: string): string {
  const html = marked.parse(src ?? '', { async: false }) as string;
  return wrapFrame(title, html);
}

type A2Node = {
  type?: string;
  text?: string;
  level?: number;
  title?: string;
  src?: string;
  alt?: string;
  href?: string;
  label?: string;
  language?: string;
  code?: string;
  items?: unknown[];
  columns?: string[];
  rows?: unknown[][];
  children?: unknown[];
};

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function renderA2Node(node: unknown, depth: number): string {
  if (typeof node === 'string') return `<p>${escapeHtml(node)}</p>`;
  if (!isObj(node)) return '';
  if (depth > 12) return `<p class="meta">(max depth reached)</p>`;
  const n = node as A2Node;
  const t = (n.type ?? '').toLowerCase();

  const renderChildren = (c: unknown): string => {
    if (!Array.isArray(c)) return '';
    return c.map((child) => renderA2Node(child, depth + 1)).join('');
  };

  switch (t) {
    case 'text':
    case 'paragraph':
      return `<p>${escapeHtml(n.text ?? '')}</p>`;
    case 'heading': {
      const level = Math.min(Math.max(Number(n.level ?? 2), 1), 4);
      return `<h${level}>${escapeHtml(n.text ?? '')}</h${level}>`;
    }
    case 'code':
      return `<pre><code${n.language ? ` class="language-${escapeHtml(n.language)}"` : ''}>${escapeHtml(n.code ?? n.text ?? '')}</code></pre>`;
    case 'image':
      return `<img src="${escapeHtml(n.src ?? '')}" alt="${escapeHtml(n.alt ?? '')}" />`;
    case 'list': {
      const items = (n.items ?? [])
        .map((it) => `<li>${renderA2Node(it, depth + 1)}</li>`)
        .join('');
      return `<ul class="a2-list">${items}</ul>`;
    }
    case 'table': {
      const cols = n.columns ?? [];
      const rows = n.rows ?? [];
      const head = `<thead><tr>${cols.map((c) => `<th>${escapeHtml(String(c))}</th>`).join('')}</tr></thead>`;
      const body = rows
        .map(
          (row) =>
            `<tr>${(row ?? []).map((cell) => `<td>${escapeHtml(typeof cell === 'string' ? cell : JSON.stringify(cell))}</td>`).join('')}</tr>`
        )
        .join('');
      return `<table>${head}<tbody>${body}</tbody></table>`;
    }
    case 'card':
      return `<section class="card">${n.title ? `<h3>${escapeHtml(n.title)}</h3>` : ''}${renderChildren(n.children)}</section>`;
    default:
      if (Array.isArray(n.children)) return `<div>${renderChildren(n.children)}</div>`;
      if (typeof n.text === 'string') return `<p>${escapeHtml(n.text)}</p>`;
      return `<pre>${escapeHtml(JSON.stringify(n, null, 2))}</pre>`;
  }
}

export function renderA2ui(title: string, src: string): string {
  let parsed: unknown;
  try {
    parsed = src ? JSON.parse(src) : null;
  } catch {
    return wrapFrame(
      title,
      `<div class="error">A2UI payload is not valid JSON.</div><pre>${escapeHtml(src)}</pre>`
    );
  }
  if (!parsed) return wrapFrame(title, `<p class="meta">(empty A2UI payload)</p>`);
  const root = isObj(parsed) && 'root' in parsed ? (parsed as { root: unknown }).root : parsed;
  const inner = Array.isArray(root)
    ? root.map((n) => renderA2Node(n, 0)).join('')
    : renderA2Node(root, 0);
  return wrapFrame(title, inner);
}

export function renderDownloadNotice(title: string, src: string): string {
  let meta: Record<string, unknown> = {};
  try {
    meta = src ? (JSON.parse(src) as Record<string, unknown>) : {};
  } catch {
    return wrapFrame(title, `<div class="error">Invalid download metadata.</div>`);
  }
  const name = typeof meta.name === 'string' ? meta.name : title;
  const mediaType =
    typeof meta.mediaType === 'string' ? meta.mediaType : 'application/octet-stream';
  const url = typeof meta.url === 'string' ? meta.url : null;
  const available = meta.downloadAvailable !== false && Boolean(url);
  const sizeBytes = typeof meta.sizeBytes === 'number' ? meta.sizeBytes : null;

  const action = available
    ? `<p><a class="btn" href="${escapeHtml(url!)}" rel="noopener noreferrer" download="${escapeHtml(name)}">Baixar arquivo</a></p>`
    : `<p class="meta">Download indisponível (arquivo truncado ou sem payload).</p>`;

  const sizeLine =
    sizeBytes !== null
      ? `<p class="meta">${escapeHtml(mediaType)} · ${sizeBytes} bytes</p>`
      : `<p class="meta">${escapeHtml(mediaType)}</p>`;

  return wrapFrame(
    title,
    `<section class="card"><h3>${escapeHtml(name)}</h3>${sizeLine}${action}</section>`
  );
}

export function renderInlineBinary(title: string, mimeType: string, buf: Buffer): string {
  const dataUrl = `data:${mimeType};base64,${buf.toString('base64')}`;
  const inner = `<section class="card"><h3>${escapeHtml(title)}</h3><p class="meta">${escapeHtml(mimeType)} · ${buf.byteLength} bytes</p><p><img src="${dataUrl}" alt="${escapeHtml(title)}" /></p></section>`;
  return wrapFrame(title, inner);
}

export function renderForProtocol(
  protocol: VisualArtifactProtocol,
  title: string,
  payload: string | null
): string {
  if (protocol === 'html-sandbox' || protocol === 'mcp-app') {
    return payload ?? wrapFrame(title, `<p class="meta">(empty artifact)</p>`);
  }
  if (protocol === 'markdown') return renderMarkdown(title, payload ?? '');
  if (protocol === 'a2ui') return renderA2ui(title, payload ?? '');
  if (protocol === 'download') return renderDownloadNotice(title, payload ?? '');
  return wrapFrame(title, `<p class="meta">Unsupported artifact protocol: ${escapeHtml(protocol)}</p>`);
}

/** @deprecated use renderForProtocol */
export function renderArtifactHtml(artifact: VisualArtifact, storedHtml?: string): string {
  const payload = storedHtml ?? artifact.html ?? '';
  return renderForProtocol(artifact.protocol, artifact.title ?? artifact.artifactId, payload);
}
