# AGENTS.md — constituição do projeto

Este arquivo é a fonte de verdade para IAs e desenvolvedores que trabalham neste
repositório. Invariantes abaixo derivam de `docs/COPILOTKIT_REFACTOR_SPEC.md`.

## Invariantes (não negociáveis)

1. **Nunca** expor `clawg_ui_device_token` no bundle frontend, logs ou respostas HTTP.
2. **Nunca** aceitar `X-OpenClaw-Session-Key` vindo do browser. O backend é a única fonte.
3. **Nunca** usar `OPENCLAW_GATEWAY_TOKEN` como Bearer do clawg-ui (só para Gateway WS).
4. Todo chat CopilotKit passa por `/api/copilotkit` → `/api/agui` → clawg-ui. Sem atalhos.
5. `conversations.threadId` é estável por conversa. Nunca gerar novo thread por mensagem.
6. `agent.openclawAgentId` é imutável após a primeira mensagem da conversa.
7. O backend injeta `X-OpenClaw-Agent-Id` e `X-OpenClaw-Session-Key` no proxy.
8. **Proibido** renderer semântico por tipo (`DashboardRenderer`, `ChartRenderer`…). Usar `VisualArtifactHost` por `artifact.protocol`.
9. HTML arbitrário só em `<iframe sandbox>` via `/api/artifacts/:id/frame` com CSP restritiva.
10. Eventos AG-UI recebidos do clawg-ui são gravados em `agui_events` e reproduzíveis por fixtures.
11. `sessionId` no proxy = `conversationId` via header `X-App-Session-Id` assinado (HMAC).
12. Tokens OpenClaw em repouso: AES-256-GCM + HKDF de `APP_AUTH_SECRET`.
13. Gateway WS indisponível não bloqueia chat HTTP via clawg-ui (modo degradado).
14. `run_code` é tool do gateway OpenClaw, não client tool CopilotKit (filtrar no proxy).

## Estrutura de camadas (FSD + API)

```
client/src/
  features/copilot/   ← CopilotKit provider + chat (única entrada de chat novo)
  features/artifact/  ← VisualArtifactHost
  widgets/chat/       ← legado; deprecar após cutover

api/src/
  routes/copilotkit/  ← CopilotRuntime Express
  routes/agui/        ← proxy SSE clawg-ui
  services/agui/      ← event-parser, clawg-ui-proxy
  services/security/  ← app-session, crypto, session-scope
```

## Antes de abrir PR (refatoração CopilotKit)

- [ ] `npm run harness:check`
- [ ] `npm run test:agui:fixtures` (api)
- [ ] `npm run harness:verify` com stack real (G11 live é o gate padrão)
- [ ] Atualizar `tests/e2e/*@live` se mudar UI CopilotKit/pairing
- [ ] Atualizar `docs/DECISIONS.md` se mudar contrato
- [ ] Atualizar `docs/HARNESS_REPORT.md` com testes executados
- [ ] Nenhum invariante acima violado

## Mapa de documentação

| Tópico | Arquivo |
|--------|---------|
| Spec completa | `docs/COPILOTKIT_REFACTOR_SPEC.md` |
| ADRs | `docs/DECISIONS.md` |
| Relatório de fases | `docs/HARNESS_REPORT.md` |
| Stack gateway Docker | `docker-compose.yml` + `.env.example` (raiz) |
