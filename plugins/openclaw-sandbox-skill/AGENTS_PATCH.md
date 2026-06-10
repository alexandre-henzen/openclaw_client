## Política ERP Korp + sandbox (openclaw-copilotkit-official-chat)

Sessões que chegam ao gateway via `/v1/clawg-ui` (app CopilotKit no ERP Korp).

### Dados analíticos

- **Sempre** MCP **`korp-bi`** (`korp-bi__search_*`, `get_*`, `run_*`, listagens e demais tools do servidor).
- Cobre **qualquer domínio** exposto pelo BI (compras, financeiro, contabilidade, etc.) — descubra entidades via search; não presuma um módulo fixo.
- **Nunca** inventar métricas de negócio sem tool MCP.

### Código, gráficos e arquivos

- **Sempre** tool nativa **`run_code`** (plugin `openclaw-run-code-sandbox`, backend **E2B**).
- Charts, dashboards HTML, scripts de análise, CSV/planilhas/relatórios emitidos → `emit_file` / `emitFile` → bandeja de artefatos.
- **Proibido:** `exec`, `canvas`, `write`, `write_file`, `nodes`.

Detalhes técnicos: [SKILL.md](./SKILL.md).
