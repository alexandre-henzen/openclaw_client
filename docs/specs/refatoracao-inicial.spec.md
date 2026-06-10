# Refatoracao Inicial Spec

> Especificação de engenharia reversa do estado atual do `OpenClaw_client`.
> Gerada via processo cursor-loop-refactor em 2026-06-09. Esta spec **não** autoriza
> refatoração ainda — ela documenta o sistema, identifica lacunas e define a estratégia
> de verificação para qualquer refatoração futura.

## Goal

Documentar a arquitetura real do OpenClaw Client (monorepo `api/` + `client/`),
identificar áreas sem spec, sem teste e de risco, e definir a estratégia de testes
(unit, integração, Playwright e2e sem mocks) que servirá de base para refatorações
seguras e verificáveis.

## Context

- **Project area:** monorepo completo — backend `api/` (Express 4 + TypeORM 0.3 + SQLite via better-sqlite3, TypeScript), frontend `client/` (React 19 + Vite 7 + MUI 7 + Redux Toolkit 2, FSD), orquestração `scripts/`, e2e `tests/e2e/` (Playwright).
- **Entry points:**
  - API: `api/src/app.ts` (dev: `ts-node`; prod: `node build/src/app.js`) — porta `18802` (`PORT`), bind `API_HOST` (default `0.0.0.0`).
  - Client: `client/src/app/main.tsx` → `App.tsx` (React Router 7 declarativo, páginas lazy) — porta `18800` (`CLIENT_PORT`).
  - CLI/orquestração: `scripts/dev.js` (API + client + Docker gateway), `scripts/start.js`/`scripts/cli.mjs` (deploy em `~/.openclaw_client`), `scripts/stop.js`.
  - WebSocket PTY: `/ws/pty` (ticket de uso único via `POST /api/auth/ws-ticket`).
- **Important files:**
  - Proxy AG-UI: `api/src/routes/agui/index.ts` + `api/src/services/agui/clawg-ui-proxy.ts` + `api/src/services/agui/event-parser.ts`.
  - CopilotKit runtime: `api/src/routes/copilotkit/index.ts` (CopilotRuntime → HttpAgent → loopback `/api/agui`).
  - Segurança: `api/src/services/security/{app-session,crypto,session-scope}.ts`, `api/src/middlewares/auth.ts`.
  - Artefatos: `api/src/services/artifacts/*` + `api/src/routes/artifacts/index.ts`; client `client/src/features/artifact/ui/VisualArtifactHost.tsx`.
  - Gateway WS: `api/src/services/openclawGateway.ts`; pairing: `api/src/services/openclaw/pairing.ts`.
  - Chat novo: `client/src/features/copilot/ui/OpenClawCopilotChat.tsx`; shell: `client/src/widgets/chat/ui/Chat.tsx`.
  - Banco: `api/src/data-source.ts` + `api/src/entities/*` (9 entidades).
  - Harness: `scripts/check-invariants.mjs`, `scripts/harness-verify.mjs`, `api/tests/harness/smoke-{copilot,artifacts}.mjs`.
- **Runtime dependencies:**
  - OpenClaw Gateway (HTTP `:18789` + clawg-ui em `/v1/clawg-ui`) — via Docker (`copilotkit/docker-compose.yml`, pasta gitignored) ou instalação local.
  - Pairing helper `:18790`; OpenClaw CLI (`openclaw`) para PTY e pairing fallback.
  - SQLite em `api/data/openclaw.sqlite` (`DB_PATH`); artefatos em filesystem `api/data/artifacts/` (content-addressed `fs:<sha256>`).
  - Node 18+; Docker opcional porém necessário para o stack completo de dev.
- **Environment variables (principais — lista completa nos relatórios de discovery):**
  - API: `PORT`, `API_HOST`, `DB_PATH`, `JWT_SECRET` (obrigatória), `JWT_EXPIRES_IN`, `APP_AUTH_SECRET` (raiz HKDF/HMAC/AES, mín. 32 chars), `SESSION_KEY_SALT`, `ALLOWED_DOMAIN`, `OPENCLAW_STRICT_CORS`, `OPENCLAW_GATEWAY_URL`, `OPENCLAW_CLAWG_UI_PATH`, `OPENCLAW_GATEWAY_TOKEN` (só Gateway WS/pairing, nunca Bearer clawg-ui), `OPENCLAW_HOME`, `OPENCLAW_BIN`, `OPENCLAW_USE_DOCKER_PAIRING`, `VISUAL_ARTIFACT_*` (caps e CSP), `PTY_BACKEND`.
  - Client: `VITE_API_BASE_URL`, `VITE_API_PORT` (default 18802), `VITE_CLIENT_PORT`/`CLIENT_PORT` (default 18800), `window.__OPENCLAW_CONFIG__` injetado em produção.
  - Usuário: `~/.openclaw_client/.env` (`API_PORT`, `CLIENT_PORT`, `USE_RELATIVE_API_URL`).
  - Harness/e2e: `E2E_LIVE`, `PLAYWRIGHT_SKIP_WEBSERVER`, `PLAYWRIGHT_BASE_URL`, `API_BASE`, `HARNESS_LOGIN_EMAIL/PASSWORD`, `HARNESS_SKIP_{SMOKE,E2E,G9,G10}`, `HARNESS_E2E_MOCKED`.
- **Database/storage dependencies:**
  - TypeORM com **`synchronize: true` e zero migrations** (`api/src/data-source.ts`).
  - 9 entidades: `User`, `Agent`, `Conversation` (threadId ULID estável, índice único `(agentId, sessionKey)`), `Message`, `BlackList` (logout JWT), `GatewayProfile` (`clawgUiDeviceTokenEnc` AES-256-GCM), `AguiEvent` (replay por fixtures), `VisualArtifact`, `CopilotRun`.
  - Seed: cria `admin@admin.com` / `123456` se não houver usuário ativo (`api/src/seed.ts`).

## Observed Behavior

Fatos provados a partir de código, rotas, schemas, testes e configuração:

1. **Fluxo de chat novo (CopilotKit):** browser → `POST /api/copilotkit` (JWT + `X-App-Session-Id`) → CopilotRuntime → HttpAgent loopback → `POST /api/agui` (somente HMAC `X-App-Session-Id`, sem JWT) → `clawg-ui-proxy` injeta `Authorization` (device token decifrado), `X-OpenClaw-Agent-Id` e `X-OpenClaw-Session-Key` → SSE de volta, eventos persistidos em `agui_events`, artefatos em `visual_artifacts`.
2. **Chat legado coexiste:** `POST /api/message/chat` ainda ativo com header `Deprecation: true`; no client, `widgets/chat/model/useChat.ts`, `MessageList.tsx`, `ChatInput.tsx` e `features/message/send/useSendMessage.ts` existem mas **não são importados** pelo caminho ativo. `entities/message/api.ts` (`usePollMessagesQuery`) ainda é usado pelo `CopilotChatHistoryLoader` para hidratar histórico.
3. **Autenticação dupla:** JWT (bcrypt login, blacklist no logout, payload `{id, valid}`) para rotas REST; HMAC app-session (`conversationId.mac`, HKDF de `APP_AUTH_SECRET`) para `/api/agui` e artifacts frame/download (header `X-App-Session-Id` ou query `?st=`).
4. **Artefatos:** host único `VisualArtifactHost` roteia por `artifact.protocol` (`mcp-app`, `html-sandbox`, `a2ui`, `markdown`, `file`); iframe `sandbox="allow-scripts allow-forms"` sem `allow-same-origin`, CSP restritiva em `api/src/services/artifacts/csp.ts`. Sem renderers semânticos por tipo (invariante 8 respeitada).
5. **`run_code`:** registro do client é filtrado no proxy e a tool é forçada via `forwardedProps` (`clawg-ui-proxy.ts`); `RunCodeObserver` converte resultados em artefatos.
6. **PTY:** `/ws/pty` com ticket de 30s de uso único (`ptyTickets.ts`), spawna `openclaw agents add <agent>` via node-pty (bridge Python como fallback POSIX).
7. **Testes existentes:**
   - API unit/fixture (node:test): `event-parser`, `mime-policy`, `sanitize-media-text`.
   - API integração real (SQLite temporário, exige `npm run build` prévio): `run-code-observer.integration.test.mjs`.
   - Smoke live HTTP (exigem API rodando): `smoke-copilot.mjs` (G1–G10, G12), `smoke-artifacts.mjs` (G13–G17).
   - Playwright: 3 specs `@mocked` (login, pairing, chat surface) e 4 specs `@live` (login, chat G11, artifacts G18, pie-chart com LLM real G19).
   - **Client: zero testes unitários** (sem Vitest/Jest/Testing Library).
8. **Harness:** `harness:check` faz verificação mecânica das invariantes do AGENTS.md (greps I-01..I-09 + existência de docs e specs e2e); `harness:verify` roda check → build api → fixtures → artifacts → build client → smokes → Playwright **live por default** (G11 live, conforme ADR D-008).
9. **CORS permissivo por default** (todas as origens), modo estrito só com `OPENCLAW_STRICT_CORS=1` (`api/src/middlewares/cors.ts`).
10. **Invariantes verificadas no código atual:** `clawg_ui_device_token` não aparece no client; `X-OpenClaw-Session-Key` não é enviado pelo browser; client envia apenas JWT + `X-App-Session-Id`.
11. **`GET /api/conversation` retorna todas as conversas sem filtro por `createdBy`**; rotas `/api/update/status` e `/api/gateway/status` são públicas (sem JWT).
12. **Swagger** apenas em development (`/api/docs`), gerado de `**/routes/**/doc.yaml`; rotas novas (copilotkit, agui, artifacts, runs) podem não ter doc.yaml.
13. **HARNESS_REPORT.md** declara Fases 0–5 completas (2026-06-09) com G1–G18 passando; há divergência textual: o relatório diz que G11 roda mocked por default, mas `harness-verify.mjs` roda live por default.

## Inferred Intent

Tudo abaixo é inferência, não fato provado:

- (inferência) O app assume operação **single-user/LAN/Tailscale** — explica CORS permissivo, ausência de filtro `createdBy` em conversas e seed de admin com senha fraca.
- (inferência) O caminho legado de chat (`/message/chat`, `useChat`, `MessageList`) é mantido apenas até o cutover completo (Fase 5 / invariante "deprecar widgets/chat") e a hidratação de histórico do CopilotKit.
- (inferência) `synchronize: true` é aceito porque o SQLite é local e descartável por instalação; migrations nunca foram necessárias.
- (inferência) A duplicação de portas e derivação dinâmica de `API_BASE_URL` (sem proxy Vite) existe para suportar acesso via Tailscale/LAN por hostname arbitrário.
- (inferência) `agui_events` existe para replay determinístico por fixtures (invariante 10) e debugging, não para reconstrução de estado de UI.

## Unknowns

Perguntas que o código não responde:

1. Há instalações em produção multiusuário onde o vazamento de conversas entre usuários (`GET /api/conversation` sem filtro) seria um problema real?
2. O `copilotkit/` (reference checkout + docker-compose, gitignored) está presente e atualizado em todas as máquinas de dev? O stack Docker é reprodutível a partir de qual fonte?
3. Existe política de retenção/GC para `api/data/artifacts/` e `agui_events`? Hoje não há limpeza visível.
4. O fluxo `updateService.applyUpdate()` (git pull + restart a partir do GitHub) é usado de fato? Qual o comportamento em instalações via `npm start`/`~/.openclaw_client`?
5. Qual é o comportamento esperado quando `APP_AUTH_SECRET` muda (todas as app-sessions e device tokens cifrados ficam inválidos)? Há procedimento de rotação?
6. `JWT_EXPIRES_IN` default `30d` é intencional para o perfil de uso?
7. A divergência G11 mocked vs live entre `HARNESS_REPORT.md` e `harness-verify.mjs` é erro de doc ou mudança não registrada?

## Risks

- **Untested behavior (caminhos críticos sem teste automatizado isolado):**
  - `api/src/middlewares/auth.ts` (JWT + blacklist), login bcrypt, logout.
  - `api/src/services/security/{crypto,app-session,session-scope}.ts` — HKDF, AES-256-GCM, HMAC: zero testes unitários.
  - `clawg-ui-proxy.ts` completo (headers, filtragem `run_code`, abort via `DELETE /api/runs/:runId`, persistência de eventos) — coberto só indiretamente por smoke live.
  - Pairing (CLI/Docker/HTTP helper), `openclawGateway.ts` (handshake WS, reconexão), `updateService.applyUpdate()`.
  - Client inteiro: 0 testes unitários (slices, `baseApi`, `legacyMessagesToCopilot`, `mime-policy`/`artifact-display` do client).
- **Hidden coupling:**
  - CopilotRuntime → HttpAgent → loopback `/api/agui` depende de `Host`/`x-forwarded-proto` corretos e do repasse do header `X-App-Session-Id` através do CopilotKit.
  - Filtragem de `run_code` no proxy + reinjeção via `forwardedProps` é invariante sutil sem teste dedicado.
  - `CopilotChatHistoryLoader` acopla o chat novo ao polling legado (`entities/message/api.ts`) — bloqueia remoção total do legado.
  - Testes de integração da API importam de `api/build/` — exigem `npm run build` prévio (falham silenciosamente sem build atualizado).
- **Deployment/runtime risk:**
  - `synchronize: true` sem migrations: qualquer mudança de entidade altera schema em produção sem histórico nem rollback.
  - CORS permissivo por default em produção; rotas públicas `/api/update/status` e `/api/gateway/status`.
  - `harness:verify` live exige stack completo (API + client + gateway Docker pareado) — frágil em CI sem Docker.
- **Data migration risk:** adotar migrations exige snapshot do schema atual como baseline antes de desligar `synchronize`.
- **Security/auth risk:**
  - Seed `admin@admin.com`/`123456`.
  - JWT em `localStorage` (XSS = comprometimento total).
  - `?st=` (app-session token) em query string de iframe/download — exposição em histórico/logs (mitigado por `referrerPolicy="no-referrer"` e escopo por conversa).
  - `GET /api/conversation` sem filtro por dono; handler de artifacts list valida app-session mas não ownership do `req.user`.
  - `APP_AUTH_SECRET` fraco torna app-sessions forjáveis.

## Discover

O que o Cursor deve inspecionar antes de editar qualquer área:

1. Ler `AGENTS.md` (invariantes 1–14), `docs/COPILOTKIT_REFACTOR_SPEC.md`, `docs/ARTIFACTS_SPEC.md`, `docs/DECISIONS.md` (D-001..D-008) e `docs/HARNESS_REPORT.md`.
2. Rodar `npm run harness:check` para o estado das invariantes mecânicas.
3. Para mudanças no backend: `api/src/app.ts` (ordem de middlewares), `api/src/routes/index.ts` (mapa de rotas), `api/src/data-source.ts` + entidades, e os serviços tocados.
4. Para mudanças no client: `client/src/app/App.tsx` (rotas), `client/src/shared/api/baseApi.ts` (resolução de URL e auth), `client/src/app/store/store.ts`, e a feature/widget tocado.
5. Para mudanças no fluxo de chat/artefatos: os 7 specs em `tests/e2e/`, `api/tests/harness/smoke-*.mjs` e os gates G1–G19 mapeados na SPEC-001.
6. Confirmar dependências de runtime: gateway up (`npm run openclaw:status`), pairing (`POST /api/openclaw/pairing/check`), build da API atualizado para testes de integração.

## Plan

Passos pequenos e verificáveis, primeiro preservando comportamento. **Nenhum deles deve ser executado nesta tarefa** — esta spec apenas os define.

**Fase A — Rede de segurança (sem mudança de comportamento):**
1. Adicionar testes unitários de caracterização para `services/security/` (crypto round-trip AES-GCM, sign/verify app-session, buildUserScope) com `node:test`, padrão já usado na API.
2. Adicionar testes de caracterização para `middlewares/auth.ts` + login/logout (supertest contra `app` exportado com `NODE_ENV=test`).
3. Adicionar teste dedicado para a filtragem de `run_code` e injeção de headers em `clawg-ui-proxy.ts` (fixtures SSE já existem como padrão).
4. Introduzir Vitest no `client/` (stack-detection: Vite → Vitest) com primeiros testes para `legacyMessagesToCopilot`, `artifact-display`/`mime-policy` e `auth/slice`.

**Fase B — Higiene estrutural (comportamento preservado):**
5. Remover código morto do chat legado no client (`useChat.ts`, `MessageList.tsx`, `ChatInput.tsx`, `useSendMessage.ts`) após confirmar via grep que nada os importa; manter `entities/message/api.ts` (usado pelo history loader).
6. Adicionar `doc.yaml` para rotas novas sem Swagger (copilotkit, agui, artifacts, runs) ou registrar decisão de não documentá-las.
7. Corrigir divergência de documentação G11 (mocked vs live) em `docs/HARNESS_REPORT.md`.

**Fase C — Melhorias de risco (mudança de comportamento, cada uma com ADR em `docs/DECISIONS.md`):**
8. Baseline de migrations TypeORM e desligar `synchronize: true` (snapshot do schema atual primeiro).
9. Filtrar `GET /api/conversation` por `createdBy` (decidir antes: o app é single-user por contrato?). Resolver Unknown #1 antes.
10. Forçar troca da senha seed no primeiro login ou gerar senha aleatória impressa no console.
11. Política de retenção/GC para `agui_events` e `data/artifacts/`.

Cada passo: arquivos prováveis, teste novo/atualizado, comando de verificação e rollback (revert do commit; passos C8+ exigem backup do SQLite antes).

## Execute

Não executar nesta tarefa (escopo é só especificação). Quando uma fase for autorizada:

- Trabalhar em passos atômicos da Fase A → B → C, um commit por passo.
- Antes de refatorar qualquer comportamento incerto, escrever o teste de caracterização primeiro e vê-lo passar contra o código atual.
- Manter contratos públicos estáveis (rotas `/api/*`, headers, shape dos eventos AG-UI) salvo exigência explícita de spec + ADR.
- Nunca violar as invariantes 1–14 do `AGENTS.md`; rodar `npm run harness:check` após cada passo.

## Verify

### Static checks
- `npm run lint` em `api/` e em `client/`.
- Typecheck: `npm run build` em `api/` (tsc é o gate) e `npm run build` em `client/` (`tsc -b && vite build`).
- `npm run harness:check` (invariantes mecânicas do AGENTS.md).

### Unit tests
- API: `npm run test:agui:fixtures` e `npm run test:artifacts` (em `api/`, node:test).
- API (a criar, Fase A): testes de `security/`, `auth`, proxy.
- Client (a criar, Fase A): `npx vitest run` em `client/`.

### Integration tests
- `npm run test:artifacts:observer` (em `api/`; exige `npm run build` antes — SQLite real temporário).
- Smokes live (exigem API rodando em `:18802`): `npm run test:harness:smoke` e `npm run test:harness:artifacts` (em `api/`).

### Playwright e2e
- Subir stack real: `npm run dev` (orquestra API `:18802` + client `:18800` + gateway Docker `:18789` via `openclaw:ensure`); pairing aprovado na primeira vez.
- Mocked (rápido, não vale como readiness): `npm run test:e2e:mocked`.
- **Live sem mocks (gate de readiness):** `npm run test:e2e:live` — ou o gate completo `npm run harness:verify` (default = G11 live).
- Required real user journey (sem nenhum mock, usuário real no browser):
  1. Abrir `http://127.0.0.1:18800/login`, logar com credenciais reais.
  2. Criar/abrir conversa de um agente, enviar mensagem e receber resposta do assistente em streaming (G11 live — `tests/e2e/chat-live.spec.ts`).
  3. Pedir um gráfico (pie chart) e ver o artefato renderizado em iframe sandbox (G19 — `tests/e2e/artifacts-pie-chart-live.spec.ts`).

## Iterate

Em caso de falha:

1. Capturar comando exato + resumo do erro (e trace/screenshot/video do Playwright em `test-results/` e `playwright-report/`).
2. Classificar a causa: implementação, setup de teste, ambiente (gateway down, pairing pendente, build da API desatualizado, Docker ausente) ou premissa errada desta spec.
3. Corrigir a menor causa. Falhas comuns conhecidas: testes de integração importando `api/build/` desatualizado → rodar `npm run build` em `api/`; `@live` skipando → exportar `E2E_LIVE=1` e verificar gateway pareado.
4. Rerodar o check que falhou, depois `npm run harness:verify`.
5. Se a premissa da spec estava errada, atualizar esta spec (e `docs/DECISIONS.md` se houver mudança de contrato).

## Actions

- [x] Discover: arquitetura, entrypoints, rotas, serviços, entidades, env vars, testes e scripts mapeados (relatórios em 2026-06-09).
- [x] Identificar specs faltantes, testes faltantes e áreas de risco (seções acima).
- [x] Detectar stack e definir estratégia de testes (node:test na API, Vitest a introduzir no client, Playwright live para e2e).
- [x] Criar/atualizar esta spec e `tasks/refatoracao-inicial.cursor-task.md`.
- [x] (Fase A — 2026-06-09) Testes de caracterização: security (18), auth (11), proxy (3), client units (Vitest, 20). Bugs reais corrigidos: flush do `RUN_FINISHED` em `parseAguiStream`; crash de página em branco em `legacyMessagesToCopilot(undefined)`.
- [x] (Fase B — 2026-06-09) Código morto do chat legado removido (`useChat`, `MessageList`, `ChatInput`, `useSendMessage`); `doc.yaml` para `copilotkit`/`agui`/`artifacts`/`runs`; G11 corrigido em `docs/HARNESS_REPORT.md`.
- [ ] (futuro, Fase C) Migrations baseline, ownership de conversas, seed seguro, GC — cada um com ADR (requer resolução dos Unknowns #1/#3/#5).
- [x] (Fases A/B) Verificação completa executada: `npm run harness:verify` — all gates passed (smokes G1–G17 + Playwright live G11/G18/G19). Ver `docs/HARNESS_REPORT.md` (entrada 2026-06-09 Refatoração Fases A/B).

## Stop Condition

Para **esta tarefa** (especificação inicial): parar quando esta spec e o task file estiverem completos e fiéis ao código — sem refatorar nada. ✔

Para as **fases futuras**, parar somente quando todas forem verdadeiras:
1. `npm run harness:check` passa (zero violações de invariantes).
2. Lint + build de `api/` e `client/` passam.
3. Todos os testes unitários e de integração passam (incluindo os novos da Fase A).
4. `npm run test:e2e:live` passa com stack real (API + client + gateway pareado), sem mocks.
5. `docs/DECISIONS.md` e `docs/HARNESS_REPORT.md` atualizados quando contrato ou gates mudarem.

## Verified Output

**Desta tarefa (somente análise — nenhum código de produção alterado):**

- Comandos/inspeções executados: leitura de `package.json` (raiz, api, client), `playwright.config.ts`, exploração completa de `api/src`, `client/src`, `scripts/`, `tests/e2e/`, `docs/` e `api/tests/`.
- Resultado: arquitetura, 15+ grupos de rotas, 9 entidades, ~40 env vars, 13 arquivos de teste e 19 gates (G1–G19) mapeados; lacunas e riscos registrados nas seções `Risks` e `Unknowns`.
- Evidência: este documento + `tasks/refatoracao-inicial.cursor-task.md`.
- Riscos remanescentes/desconhecidos: ver `Unknowns` (7 itens) — em especial multiusuário (#1), reprodutibilidade do stack Docker (#2) e rotação de `APP_AUTH_SECRET` (#5).

**Para fases futuras**, o Verified Output obrigatório é: comandos executados com saída, pass/fail por gate, caminhos de evidência (`playwright-report/`, `test-results/`, traces, screenshots, logs) e riscos remanescentes.
