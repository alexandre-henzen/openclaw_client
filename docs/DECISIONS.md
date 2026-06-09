# DECISIONS

Registro append-only de decisões arquiteturais (ADR-lite).

---

## D-001 — CopilotKit como UI, clawg-ui como bridge AG-UI

- **Data:** 2026-06-08
- **Status:** aceita
- **Decisão:** CopilotKit no client; Express expõe `/api/copilotkit` e `/api/agui`; OpenClaw permanece runtime.
- **Ref:** `docs/COPILOTKIT_REFACTOR_SPEC.md` §3

## D-002 — Manter Express + Vite (não Next.js)

- **Data:** 2026-06-08
- **Status:** aceita
- **Decisão:** Portar libs da referência Next.js para `api/src/` e FSD no client.

## D-003 — `conversations` como sessão AG-UI

- **Data:** 2026-06-08
- **Status:** aceita
- **Decisão:** Estender `Conversation` com `threadId`, `userScope`, `pairingStatus`.

## D-004 — Pairing clawg-ui obrigatório

- **Data:** 2026-06-08
- **Status:** aceita
- **Decisão:** Fluxo pairing antes do primeiro chat; device token criptografado em DB.

## D-005 — Visual artifacts genéricos

- **Data:** 2026-06-08
- **Status:** aceita
- **Decisão:** `VisualArtifactHost` despacha por `protocol`; sem renderers semânticos.

## D-006 — Deprecar `POST /message/chat`

- **Data:** 2026-06-08
- **Status:** aceita
- **Decisão:** Manter legado uma release; remover após E2E CopilotKit verde.

## D-007 — HMAC `X-App-Session-Id` para escopo de conversa

- **Data:** 2026-06-08
- **Status:** aceita
- **Decisão:** `signAppSessionToken(conversationId)` emitido pelo backend; browser nunca define session scope OpenClaw.
- **Ref:** port de `copilotkit/.../src/lib/security/app-session.ts`

## D-008 — Playwright E2E em duas camadas (mocked + live)

- **Data:** 2026-06-09
- **Status:** aceita
- **Decisão:** Gate **G11** no harness: **`@live` é padrão** em `harness:verify` (browser + API + gateway); `@mocked` só com `HARNESS_E2E_MOCKED=1`. CopilotKit Express usa `endpoint: '/copilotkit'` (mount `/api`). Config em `playwright.config.ts`; pular com `HARNESS_SKIP_E2E=1`.
- **Ref:** `docs/COPILOTKIT_REFACTOR_SPEC.md` §11.2–11.3
