# Setup para Nova Empresa

## Passo a passo

### 1. Copiar o projeto
Copie toda a pasta do projeto para um novo diretorio.

### 2. Configurar variaveis de ambiente
Copie o arquivo `.env.example` para `.env.local`:
```bash
cp .env.example .env.local
```

Edite o `.env.local` com os dados da nova empresa:

| Variavel | Descricao | Exemplo |
|----------|-----------|---------|
| `NEXT_PUBLIC_COMPANY_NAME` | Nome da construtora (aparece no login e sidebar) | `ABC Engenharia` |
| `NEXT_PUBLIC_COMPANY_SUBTITLE` | Subtitulo do sistema | `Sistema de Gestao` |
| `NEXT_PUBLIC_COMPANY_EMAIL_DOMAIN` | Dominio de email da empresa | `abcengenharia.com.br` |
| `SIENGE_API_URL` | URL da API Sienge (trocar SLUG pelo identificador) | `https://api.sienge.com.br/abcengenharia/public/api/v1` |
| `SIENGE_BULK_API_URL` | URL da API bulk-data Sienge | `https://api.sienge.com.br/abcengenharia/public/api/bulk-data/v1` |
| `SIENGE_USERNAME` | Usuario da API Sienge | `abcengenharia-user` |
| `SIENGE_PASSWORD` | Senha da API Sienge | `senha-aqui` |
| `NEXTAUTH_SECRET` | Secret para sessoes (gerar unico) | Usar: `openssl rand -base64 32` |
| `NEXTAUTH_URL` | URL do sistema | `http://localhost:3000` |
| `ADMIN_USERNAME` | Usuario de login do sistema | `admin` |
| `ADMIN_PASSWORD` | Senha de login do sistema | `admin` |

### 3. Instalar e rodar
```bash
npm install
npm run dev
```

Acesse http://localhost:3000 e faca login com as credenciais definidas em `ADMIN_USERNAME` e `ADMIN_PASSWORD`.

## Como encontrar o SLUG do Sienge
O SLUG e o identificador da empresa na URL do Sienge. Se a empresa acessa o Sienge em:
```
https://api.sienge.com.br/abcengenharia/public/api/v1
```
O SLUG e `abcengenharia`.

## Credenciais da API Sienge
As credenciais (username e password) sao fornecidas pelo suporte do Sienge para acesso a API publica. Cada empresa tem suas proprias credenciais.
