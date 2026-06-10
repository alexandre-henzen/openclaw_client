# korp-mcp-gateway

Serviço Node/TypeScript que:

1. Obtém e renova o token OAuth2 Korp (`client_credentials`) em memória.
2. Expõe um proxy HTTP em `/mcp` que injeta `Authorization: Bearer …` em cada chamada ao upstream MCP.
3. Grava `mcp.servers.korp-bi` no `openclaw.json` **sem** Bearer (URL estável → sem hot-reload de token → sem corrida com `bundle-mcp`).

## Arquitetura

```
OpenClaw bundle-mcp → http://korp-mcp-gateway:8787/mcp
                              ↓ (token em memória)
                    https://api.korp.com.br/bi/v1/mcp
```

## Endpoints

| Path | Descrição |
|------|-----------|
| `GET /health` | Status do serviço + metadados do token (sem valor do token) |
| `GET /ready` | 200 se há token válido; 503 caso contrário |
| `POST /mcp` | Proxy Streamable HTTP MCP |

## Variáveis

Ver `src/config.ts`. Principais: `KORP_OAUTH_CLIENT_ID`, `KORP_OAUTH_CLIENT_SECRET`, `KORP_MCP_UPSTREAM_URL`, `OPENCLAW_CONFIG_PATH`, `KORP_MCP_PROXY_URL`.

## Desenvolvimento

```bash
cd services/korp-mcp-gateway
npm install
npm test
npm run build
```

## Docker

Incluído no `docker-compose.yml` raiz como `korp-mcp-gateway`. O `openclaw-gateway` só sobe após `/ready` OK.

Especificação completa (testes, camadas Projetos/ELT, invariantes): `openclaw-copilotkit-official-chat/docs/KORP_MCP_SPEC.md`.
