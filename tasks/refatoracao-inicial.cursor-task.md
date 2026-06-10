# Cursor Task: Refatoracao Inicial

You are working inside Cursor. Follow the loop strictly.

## Goal

Executar a refatoração inicial do OpenClaw Client em fases pequenas e verificáveis,
conforme `docs/specs/refatoracao-inicial.spec.md`: primeiro rede de segurança de testes
(Fase A), depois higiene estrutural (Fase B), depois melhorias de risco com ADR (Fase C).
Nunca violar as invariantes 1–14 do `AGENTS.md`.

## Context

Read the matching spec first: `docs/specs/refatoracao-inicial.spec.md`.

Stack: monorepo — `api/` (Express 4 + TypeORM/SQLite, TypeScript, node:test),
`client/` (React 19 + Vite 7 + MUI + RTK, FSD, **sem testes hoje**), Playwright em
`tests/e2e/` (tags `@mocked` e `@live`), harness em `scripts/`.

Relevant files likely include:
- `api/src/app.ts`, `api/src/routes/index.ts`, `api/src/data-source.ts`
- `api/src/services/security/{crypto,app-session,session-scope}.ts`
- `api/src/middlewares/auth.ts`, `api/src/routes/auth/controller.ts`
- `api/src/services/agui/clawg-ui-proxy.ts`, `api/src/services/agui/event-parser.ts`
- `api/src/routes/{copilotkit,agui,artifacts,runs}/index.ts`
- `client/src/shared/api/baseApi.ts`, `client/src/features/copilot/**`, `client/src/features/artifact/**`
- `client/src/widgets/chat/**` (legado: `useChat.ts`, `MessageList.tsx`, `ChatInput.tsx` não importados)
- `client/src/features/copilot/lib/legacyMessagesToCopilot.ts`
- `tests/e2e/*.spec.ts`, `api/tests/**`, `scripts/{check-invariants,harness-verify}.mjs`
- `AGENTS.md`, `docs/COPILOTKIT_REFACTOR_SPEC.md`, `docs/DECISIONS.md`, `docs/HARNESS_REPORT.md`

## Discover

Before editing, inspect:
- A spec (`docs/specs/refatoracao-inicial.spec.md`) — seções Observed Behavior, Risks e Plan.
- `npm run harness:check` — estado das invariantes mecânicas.
- Os arquivos da fase/passo que você vai tocar e seus testes existentes.
- Dependências de runtime para integração/e2e: gateway Docker (`npm run openclaw:status`),
  pairing aprovado, build da API atualizado (`npm run build` em `api/` — os testes de
  integração importam de `api/build/`).

Summarize what you found before making changes.

## Plan

Trabalhe um passo por vez, na ordem da spec (A1→A4, B5→B7, C8→C11). Para cada passo declare:
arquivos a mudar, mudança de comportamento esperada (nenhuma nas Fases A/B), testes a
adicionar, comandos de verificação e estratégia de rollback. Prefer characterization tests
before refactoring uncertain legacy behavior.

**Fase A — rede de segurança (sem mudança de comportamento):**
1. Unit tests `node:test` para `api/src/services/security/` (round-trip AES-GCM, sign/verify app-session, buildUserScope).
2. Testes de caracterização de auth (login bcrypt, middleware JWT + blacklist, logout) usando o `app` exportado com `NODE_ENV=test`.
3. Teste dedicado de `clawg-ui-proxy.ts`: filtragem de `run_code`, injeção de headers, persistência em `agui_events` (usar fixtures SSE como as existentes).
4. Introduzir Vitest no `client/` + primeiros testes: `legacyMessagesToCopilot`, `artifact-display`/`mime-policy`, `features/auth/slice`.

**Fase B — higiene estrutural:**
5. Remover código morto do chat legado no client (confirmar por grep que nada importa antes); manter `entities/message/api.ts` (history loader depende).
6. Swagger `doc.yaml` para rotas novas ou ADR de não-documentação.
7. Corrigir divergência G11 mocked/live em `docs/HARNESS_REPORT.md`.

**Fase C — mudanças de comportamento (uma ADR em `docs/DECISIONS.md` por item, backup do SQLite antes):**
8. Baseline de migrations TypeORM e desligar `synchronize: true`.
9. Decidir e implementar ownership em `GET /api/conversation` (resolver Unknown #1 da spec antes).
10. Seed de admin segura.
11. Retenção/GC de `agui_events` e `data/artifacts/`.

## Execute

Implement the smallest safe change. Create missing tests. Keep behavior stable unless the
spec explicitly requires a behavior change. Um commit por passo. Rodar
`npm run harness:check` após cada passo. Nunca expor `clawg_ui_device_token`, nunca aceitar
`X-OpenClaw-Session-Key` do browser, nunca usar `OPENCLAW_GATEWAY_TOKEN` como Bearer do
clawg-ui (invariantes do `AGENTS.md`).

## Verify

Run the strongest available checks:
1. Format/lint/typecheck: `npm run lint` + `npm run build` em `api/` e `client/`; `npm run harness:check` na raiz.
2. Unit tests: `npm run test:agui:fixtures` e `npm run test:artifacts` (api); `npx vitest run` (client, após Fase A4).
3. Integration tests with real dependencies: `npm run test:artifacts:observer` (api, exige build); smokes live `npm run test:harness:smoke` e `npm run test:harness:artifacts` com a API rodando.
4. Playwright e2e with the app running: `npm run test:e2e:mocked` (rápido) e `npm run test:e2e:live` (stack real).
5. Final no-mock readiness journey: `npm run harness:verify` com stack real completo (API `:18802` + client `:18800` + gateway `:18789` pareado) — gate G11 live por default; jornada real: login → conversa → mensagem → resposta streaming → artefato pie chart em iframe (G19).

Do not claim completion without command output or equivalent evidence.

## Iterate

If anything fails, fix the smallest cause and rerun the failed check, then rerun readiness
checks. Falhas conhecidas: testes de integração contra `api/build/` desatualizado → rodar
`npm run build` em `api/`; specs `@live` skipando → `E2E_LIVE=1` + gateway pareado; Docker
ausente → `npm run openclaw:ensure`. Se a premissa da spec estiver errada, atualize a spec
e registre em `docs/DECISIONS.md` quando houver mudança de contrato.

## Actions

- [x] Discover and summarize current behavior (spec preenchida em 2026-06-09)
- [x] Update or create spec (`docs/specs/refatoracao-inicial.spec.md`)
- [ ] Add missing characterization/unit tests (Fase A: security, auth, proxy, client/Vitest)
- [ ] Add or update integration tests (auth via app exportado; proxy com fixtures)
- [ ] Add or update Playwright e2e tests (manter G11/G18/G19 verdes; novos fluxos se UI mudar)
- [ ] Refactor implementation (Fase B: código morto + docs; Fase C: migrations, ownership, seed, GC — com ADRs)
- [ ] Run verification (`npm run harness:verify` após cada fase)
- [ ] Report verified output

## Stop Condition

Stop only when all required checks pass and the real Playwright user journey succeeds
without mocks:
1. `npm run harness:check` sem violações.
2. Lint + build de `api/` e `client/` verdes.
3. Todos os unit/integration tests verdes (incluindo os novos da Fase A).
4. `npm run test:e2e:live` (ou `npm run harness:verify`) verde com stack real, sem mocks.
5. `docs/DECISIONS.md` e `docs/HARNESS_REPORT.md` atualizados para qualquer mudança de contrato/gate.

## Verified Output

Report:
- Commands run (com saída resumida por gate)
- Pass/fail result por check (lint, build, unit, integration, smoke G1–G17, e2e G11/G18/G19)
- Evidence paths: `playwright-report/`, `test-results/` (screenshots, videos, traces), logs do harness
- Any remaining risks or unknowns (referenciar a seção Unknowns da spec)
