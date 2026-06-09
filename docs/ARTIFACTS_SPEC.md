# SPEC-002 — Visual Artifacts (sandbox / run_code / iframe)

Paridade com `copilotkit/openclaw-copilotkit-official-chat/` para retorno de conteúdo do sandbox, persistência, download e renderização em iframe.

## Problema

O chat mostrava **"media failed"** porque:

1. Resultados do tool `run_code` (E2B/Piston) não eram persistidos como `visual_artifacts`.
2. Arquivos binários (CSV, PDF, imagens) não tinham rota `/download` nem card de download.
3. O frame route não renderizava markdown/A2UI/imagens corretamente após persistência.
4. O cliente abria `download` via `/frame` em vez de `/download`.

## Fluxo de dados

```
AG-UI SSE (clawg-ui)
  → clawg-ui-proxy.ts
      → RunCodeObserver (TOOL_CALL_RESULT run_code)
      → normalizeArtifact (outros TOOL_CALL_RESULT)
  → visual_artifacts + data/artifacts/*.bin

Cliente (InlineArtifacts, poll 2s)
  → GET /api/conversation/:id/artifacts
  → VisualArtifactHost
      → iframe → GET /api/artifacts/:id/frame?st=
      → ArtifactDownloadCard → GET /api/artifacts/:id/download?st=
```

## Protocolos (`VisualArtifactProtocol`)

| Protocolo | Origem | UI |
|-----------|--------|-----|
| `html-sandbox` | `text/html` do sandbox | iframe (HTML bruto + CSP) |
| `markdown` | `text/markdown` | iframe (`marked`) |
| `a2ui` | envelope A2UI | iframe (renderizador A2UI) |
| `file` | imagens (`image/*`) | iframe (data URL inline) |
| `download` | CSV, PDF, Office, text/bin | `ArtifactDownloadCard` |
| `mcp-app` | MCP app HTML | iframe (+ postMessage host futuro) |

MIME → protocolo: `api/src/services/artifacts/mime-policy.ts` (portado da referência).

## API (Express)

| Rota | Auth | Função |
|------|------|--------|
| `GET /api/conversation/:id/artifacts` | JWT + `X-App-Session-Id` | Lista tray |
| `GET /api/artifacts/:id` | JWT | Metadados |
| `GET /api/artifacts/:id/frame` | `?st=` ou header | HTML sandboxed |
| `GET /api/artifacts/:id/download` | `?st=` ou header | Bytes brutos |

## Segurança (I-09)

- iframe: `sandbox="allow-scripts allow-forms"` **sem** `allow-same-origin`
- Frame CSP: `default-src 'none'`, `connect-src 'none'`, `frame-ancestors 'self'`
- Download: token HMAC escopado à `conversationId` do artefato

## Env vars

| Variável | Default | Uso |
|----------|---------|-----|
| `VISUAL_ARTIFACT_MAX_HTML_BYTES` | 5_000_000 | Texto/HTML |
| `VISUAL_ARTIFACT_MAX_RESOURCE_BYTES` | 15_000_000 | Binários |
| `VISUAL_ARTIFACT_ALLOWED_CONNECT_SRC` | `'none'` | CSP connect-src |

## Gates de aceite

- [x] `run_code` com `files[]` gera linhas em `visual_artifacts` (`RunCodeObserver`)
- [x] HTML/chart renderiza em iframe na tray (`VisualArtifactHost`)
- [x] CSV/PDF exibe card **Baixar arquivo** com `/download`
- [x] Imagem PNG renderiza inline no frame (`renderInlineBinary`)
- [x] Teste unitário `mime-policy` (`npm run test:artifacts`)
- [x] Harness G12: frame retorna CSP sem `allow-same-origin`
- [x] Integration `test:artifacts:observer` — RunCodeObserver + SQLite real
- [x] Smoke G13–G17 `test:harness:artifacts` — observer + list + frame + download HTTP
- [x] E2E live G18 `@live` — iframe `artifact-iframe` na tray

## Referência

- `copilotkit/openclaw-copilotkit-official-chat/src/lib/openclaw/run-code-observer.ts`
- `copilotkit/openclaw-copilotkit-official-chat/src/lib/artifacts/`
- `copilotkit/openclaw-copilotkit-official-chat/src/components/VisualArtifactHost.tsx`
