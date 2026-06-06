# Conector MCP Financeiro (spapi) — Cowork

Conecta o app financeiro (spapi / DTSIENGE) ao Cowork como um **MCP remoto**, no
mesmo padrão do conector `silvapacker-apropriacao` do app de metas. Permite pedir
no chat resumos de contas a pagar/receber, saldos, DRE e indicadores — e mandar
pro WhatsApp.

## Arquitetura

- **`src/app/api/mcp/route.ts`** — endpoint JSON-RPC 2.0 (Streamable HTTP).
  Autenticação por token (`?k=<MCP_API_TOKEN>` ou header `Authorization: Bearer`).
- **`src/lib/financeiroActions.ts`** — funções de resumo. Rodam *dentro* da app no
  Railway, lendo o cache PostgreSQL que o Painel já popula, e **reusam as fórmulas
  validadas** (`effectiveOpenAmount`, `isExcludedFinancialDocType`). Nada de regra
  nova: os números batem com a tela.

Nenhum arquivo de fórmula validada foi alterado — só arquivos novos + a variável
`MCP_API_TOKEN` no `.env`.

## Ferramentas expostas

| Tool | O que faz | Parâmetros |
|------|-----------|------------|
| `resumo_contas_pagar` | A pagar (vence ≥ hoje) + vencidas, total e por empresa | `empresa?`, `agruparPorCredor?` |
| `resumo_contas_receber` | A receber + inadimplência, total e por empresa | `empresa?`, `agruparPorCliente?` |
| `saldos_bancarios` | Saldo por empresa/conta no dia mais recente do cache | `empresa?` |
| `dre_resumo` | DRE consolidada por categoria (exceto Holding) | `ano?` |
| `indicadores` | CUB e valor/m² mais recentes | — |
| `listar_empresas` | Empresas cadastradas (para descobrir o nome do filtro) | — |

## Deploy (Railway)

1. **Definir a variável de ambiente** no serviço `spapi` no Railway:
   ```
   MCP_API_TOKEN=-jnrbGUSFgN01jhkppJi1b_94xpdziV1MStRnphnZx0
   ```
   (mesmo valor que está no `.env.local`; troque por outro se quiser — gere com
   `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`)
2. **Commit + push** para o Railway buildar:
   ```
   git add src/app/api/mcp/route.ts src/lib/financeiroActions.ts .env.example MCP-FINANCEIRO.md
   git commit -m "feat: conector MCP financeiro (resumos a pagar/receber/saldos/DRE)"
   git push
   ```
3. **Testar** (deve responder `{"ok":true,...}`):
   ```
   https://spapi-production.up.railway.app/api/mcp
   ```

## Conectar no Cowork

Adicione este servidor ao `.mcp.json` do plugin (ou crie um plugin novo):

```json
{
  "mcpServers": {
    "silvapacker-financeiro": {
      "type": "http",
      "url": "https://spapi-production.up.railway.app/api/mcp?k=-jnrbGUSFgN01jhkppJi1b_94xpdziV1MStRnphnZx0"
    }
  }
}
```

## WhatsApp

- **Sob demanda:** "resumo a pagar da DOMUS no WhatsApp" → o Cowork chama o tool,
  formata e envia pro grupo/contato.
- **Agendado:** tarefa do Cowork (ex.: toda segunda 8h) que roda o resumo e posta
  no grupo, igual ao resumo semanal de orçado×realizado que já roda.

## Roadmap (v1 → v2)

- `resumo_contas_receber` v1 cobre *a receber* (aberto) e *inadimplência*.
  *Recebidas* (pagas) entram após validar o shape de `income.payments[]`.
- `saldos_bancarios` lê o cache `cached_daily_balances`; se vazio, abrir a aba
  Saldos no Painel popula. Pode evoluir para puxar ao vivo do Sienge.
- Fluxo de caixa projetado, resumo de pagas e drill-down por título são próximos.
