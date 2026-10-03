# SPAPI (Financeiro Silva Packer) — EasyPanel

**Estado: MIGRAÇÃO CONCLUÍDA em 03/10/2026 (sábado, ~14:20 BRT).** Produção = EasyPanel.
`spapi-production.up.railway.app` responde **404** (domínio removido).

Migração Railway → EasyPanel da Silva Packer (`https://e-silvapacker.dtconsultorias.com`,
projeto `silva-packer`). Régua: **continuidade** — mesmo Node, mesmo lock, mesmo start.

| | |
|---|---|
| App | serviço `spapi` (porta 3000), branch **`easypanel`** deste repo, build por Dockerfile |
| Endereço | `https://silva-packer-spapi.qtnzls.easypanel.host` |
| Banco | serviço `spapi-db`, Postgres 17.11 (= origem), host interno `silva-packer_spapi-db:5432` |
| Senha do banco | `C:\Projetos Clientes\.secrets\spapi-silvapacker-db.env` |
| Backups | `C:\Backups DT\spapi-silvapacker\` |

## O que o Dockerfile reproduz da Railway (Nixpacks)

- **Node 18.20.5** (versão exata do build da Railway), `npm ci` (lock versionado).
- `NODE_OPTIONS=--max-old-space-size=8192`, igual à env da Railway, também no build.
- Start: `node scripts/migrate.js && next start` (mesmo `startCommand` do `railway.toml`).

## Envs

As 17 da Railway, copiadas como estão. Mudam só duas:
- `DATABASE_URL` → host interno + **`?sslmode=disable`**. `src/lib/db.ts` e
  `scripts/migrate.js` só ligam SSL para `railway.app`/`neon.tech`/`supabase.co`; para o host
  do EasyPanel já desligam, e o `sslmode=disable` deixa explícito.
- `NEXTAUTH_URL` → endereço novo.
`NEXTAUTH_SECRET` é o mesmo da Railway (ninguém é deslogado).

## Quem consome (a virada tem que trocar todos)

| Consumidor | Onde |
|---|---|
| Cron `refresh-cache` (GitHub Actions) | URL **fixa** em `.github/workflows/*.yml` → commit no `master` |
| Rotinas do EasyPanel (Fechamento de Caixa) | env `SPAPI_MCP_URL` do serviço `rotinas` |
| Jarvis | `jarvis/.env` |
| `silva-packer-plugin` | `.mcp.json` (repo) **e** o zip enviado ao Claude (reenviar) |
| Conector no claude.ai | configurações do claude.ai (Edielson) |
| Login com Google | client OAuth `698336514807-muuich…` — adicionar redirect novo (Edielson) |

Volume de uso medido (18/09–03/10): 12.901 chamadas MCP, 3 logins pela tela.

## Como foi o corte (03/10/2026)

1. Ensaio: dump 196 s / 142 MB, restore 203 s, 0 erros; 29 tabelas idênticas (contagem, somas,
   datas e hash de cada linha). Build local + clone limpo. Instância validada em paralelo.
2. **MCP comparado com as mesmas chamadas** nos dois lados: 9 tools, 12/13 respostas idênticas.
   `dre_resumo 2025` = mesmos valores com 2 categorias em ordem trocada (o código agrupa num
   `Map` na ordem em que o banco devolve as linhas; restore muda essa ordem). Pré-existente.
3. **18 telas com login**: 17 idênticas + Solicitações (mesma API, 18.188 itens, hash igual;
   a diferença era o toast "18188 itens carregados", transitório). 0 erros de API.
4. ⛔ **`NEXT_PUBLIC_*` são gravadas no bundle no BUILD.** Sem passá-las ao `docker build` o
   Dashboard mostrava o fallback ("Silva Packer") em vez de "Silvapacker". Corrigido com `ARG`
   no Dockerfile (`28a2b31`). Lição: comparar texto de tela pega isso; HTTP 200 não.
5. Google OAuth: o client do SPAPI (`698336514807-muuich…`, projeto `spapi-490213`) é **outro**
   que o do Metas — o Edielson adicionou o redirect novo. Testado nos dois lados.
6. Cópia final 13:45 (`--clean --single-transaction`), 238 s + 167 s, 0 diferenças.
7. Consumidores virados: rotinas (`SPAPI_MCP_URL`, redeploy), `jarvis/.env` (`FIN_MCP_URL`,
   backup `.env.bak-20261003-1354`), plugin `0.25.2` (`e448108`), workflow `master` (`ab1f61d`,
   disparado: HTTP 200, 37 s). **Edielson:** conector `silvapacker-financeiro` no claude.ai
   recriado (não há editar URL — excluir e criar; "Sem login", token no `?k=`) e plugin
   reenviado (Plugins → ⋮ → Excluir → Adicionar → zip). Testado: saldos R$ 21.161.943,33.
8. 0 chamadas MCP na Railway por 30 min → domínio removido → 404 / EasyPanel 200 / MCP 9 tools.

## Pendências
- Railway parada e intacta até ~17/10 → `railway-environment-decommission`.
- Remover o redirect da Railway do client OAuth só depois do decommission.
- Merge `easypanel` → `master` (app sai da `easypanel`; cron, do `master`).
- Fechamento de Caixa (rotinas) segue `MODO_TESTE=1` — agora pode sair do teste quando o
  Edielson decidir (a Railway, que enviava de verdade, não tem mais o SPAPI).
