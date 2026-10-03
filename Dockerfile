# SPAPI (Financeiro Silva Packer) — EasyPanel.
# Reproduz o que o Nixpacks fazia na Railway: Node 18.20.5, `npm ci` (lock versionado),
# `npm run build`, e no start `node scripts/migrate.js` + `next start`.
FROM node:18.20.5-bookworm-slim

WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
# As NEXT_PUBLIC_* sao gravadas no codigo NO BUILD (Next inlina). Na Railway o Nixpacks
# as tinha no build; aqui viram ARG (o EasyPanel passa as envs do servico como build-arg)
# com default = valor da Railway, para nao cair no fallback "Empresa"/"Silva Packer".
ARG NEXT_PUBLIC_COMPANY_NAME=Silvapacker
ARG NEXT_PUBLIC_COMPANY_SUBTITLE="Sistema de Gestao"
ARG NEXT_PUBLIC_COMPANY_EMAIL_DOMAIN=silvapacker.com.br
ENV NEXT_PUBLIC_COMPANY_NAME=$NEXT_PUBLIC_COMPANY_NAME     NEXT_PUBLIC_COMPANY_SUBTITLE=$NEXT_PUBLIC_COMPANY_SUBTITLE     NEXT_PUBLIC_COMPANY_EMAIL_DOMAIN=$NEXT_PUBLIC_COMPANY_EMAIL_DOMAIN
# NODE_OPTIONS da Railway (8 GB de heap) tambem no build, que e onde o Next mais consome.
ENV NODE_OPTIONS=--max-old-space-size=8192
RUN npm run build

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000
CMD ["sh", "-c", "node scripts/migrate.js && ./node_modules/.bin/next start -p ${PORT:-3000} -H 0.0.0.0"]
