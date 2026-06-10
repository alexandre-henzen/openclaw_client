import http from "node:http";
import https from "node:https";
import type { IncomingMessage, ServerResponse } from "node:http";
import { URL } from "node:url";

const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailers",
  "transfer-encoding",
  "upgrade",
  "host",
]);

function filterHeaders(
  headers: IncomingMessage["headers"],
  authorization: string,
): http.OutgoingHttpHeaders {
  const out: http.OutgoingHttpHeaders = {};
  for (const [key, value] of Object.entries(headers)) {
    if (!value) continue;
    const lower = key.toLowerCase();
    if (HOP_BY_HOP.has(lower)) continue;
    if (lower === "authorization") continue;
    out[key] = value;
  }
  out.authorization = authorization;
  return out;
}

export function createMcpProxyHandler(params: {
  upstream: URL;
  getAccessToken: () => Promise<string>;
}): (req: IncomingMessage, res: ServerResponse) => void {
  const upstreamPath = params.upstream.pathname + (params.upstream.search || "");
  const isHttps = params.upstream.protocol === "https:";
  const defaultPort = isHttps ? 443 : 80;
  const port =
    params.upstream.port !== ""
      ? Number(params.upstream.port)
      : defaultPort;

  return (req, res) => {
    void (async () => {
      try {
        const token = await params.getAccessToken();
        const headers = filterHeaders(req.headers, `Bearer ${token}`);
        const requestFn = isHttps ? https.request : http.request;

        const proxyReq = requestFn(
          {
            protocol: params.upstream.protocol,
            hostname: params.upstream.hostname,
            port,
            path: upstreamPath,
            method: req.method,
            headers,
          },
          (proxyRes) => {
            res.writeHead(proxyRes.statusCode ?? 502, proxyRes.headers);
            proxyRes.pipe(res);
          },
        );

        proxyReq.on("error", (err) => {
          if (!res.headersSent) {
            res.writeHead(502, { "Content-Type": "application/json" });
            res.end(
              JSON.stringify({
                error: "upstream_error",
                message: err.message,
              }),
            );
          } else {
            res.end();
          }
        });

        req.pipe(proxyReq);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (!res.headersSent) {
          res.writeHead(503, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "token_unavailable", message }));
        } else {
          res.end();
        }
      }
    })();
  };
}
