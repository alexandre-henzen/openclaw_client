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
- **Ref:** `api/src/services/security/app-session.ts`

## D-008 — Playwright E2E em duas camadas (mocked + live)

- **Data:** 2026-06-09
- **Status:** aceita
- **Decisão:** Gate **G11** no harness: **`@live` é padrão** em `harness:verify` (browser + API + gateway); `@mocked` só com `HARNESS_E2E_MOCKED=1`. CopilotKit Express usa `endpoint: '/copilotkit'` (mount `/api`). Config em `playwright.config.ts`; pular com `HARNESS_SKIP_E2E=1`.
- **Ref:** `docs/COPILOTKIT_REFACTOR_SPEC.md` §11.2–11.3

## D-009 — Uma instalação = um usuário

- **Data:** 2026-06-09
- **Status:** aceita
- **Decisão:** Cada instalação OpenClaw Client é **single-user por contrato**. Não filtrar `GET /api/conversation` por `createdBy`; isolamento entre instalações é por SQLite/`.env` separados, não multi-tenant na mesma instância.
- **Ref:** Fase C / Unknown #1 em `docs/specs/refatoracao-inicial.spec.md`

## D-010 — Migrations TypeORM (baseline + `synchronize: false`)

- **Data:** 2026-06-09
- **Status:** aceita
- **Decisão:** Baseline migration `1780512000000-BaselineSchema` captura o schema atual; `synchronize: false`; `migrationsRun: true` no boot. Instalações existentes (tabelas já criadas por sync) pulam DDL e apenas registram a migration.
- **Ref:** `api/src/data-source.ts`, `api/src/migrations/`

## D-011 — Retenção configurável via `.env`

- **Data:** 2026-06-09
- **Status:** aceita
- **Decisão:** `DATA_RETENTION_DAYS` (default **7**) controla GC de `agui_events`, linhas em `visual_artifacts` e arquivos órfãos em `data/artifacts/`. `0` desabilita. Intervalo de purge: `DATA_RETENTION_INTERVAL_HOURS` (default 24).
- **Ref:** `api/src/services/data-retention.ts`

## D-012 — Seed de admin via `.env`

- **Data:** 2026-06-09
- **Status:** aceita
- **Decisão:** Se não houver usuário ativo, criar admin a partir de `SEED_ADMIN_EMAIL` + `SEED_ADMIN_PASSWORD` (e campos opcionais de nome). Credenciais **não** ficam hardcoded no código; `.env.example` documenta valores de dev.
- **Ref:** `api/src/seed.ts`, `api/src/config/seed-admin.ts`

## D-013 — Stack gateway self-contained (sem checkout `copilotkit/`)

- **Data:** 2026-06-10
- **Status:** aceita
- **Decisão:** Gateway Docker (`docker-compose.yml` na raiz), scripts de install, plugins e `.env.example` versionados no repositório. `npm run openclaw:*` e `npm run sync:env` usam `.env` na raiz — não há dependência de pasta de referência externa.
- **Ref:** `docker-compose.yml`, `scripts/openclaw-stack.mjs`, `scripts/sync-copilot-env.mjs`
