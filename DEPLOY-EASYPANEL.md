# SPAPI (Financeiro Silva Packer) — EasyPanel

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
