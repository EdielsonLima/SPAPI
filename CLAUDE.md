# CLAUDE.md — Regras do Projeto DTSIENGE

## DRE - Regras Criticas (Validado em 2026-03-17)

### NAO ALTERAR sem pedido explicito do usuario:
- Formulas de calculo da DRE em `src/components/dre-tab.tsx` (lucroBruto, lucroOperacional, lucroLiquido, saldo, variacaoCaixa)
- Categorias negativas (NEGATIVE_CATEGORIES) em `src/components/dre-tab.tsx`
- Exclusao da empresa Holding nos fetches de DRE (`excludeCompanies=SILVA ADMINISTRADORA HOLDING LTDA`)
- Logica de parsing do Excel em `scripts/sync-excel-to-production.js`
- Funcoes getDreExcelData / saveDreExcelData em `src/lib/db.ts`
- Ordem e composicao das DRE_LINES
- Schema da tabela `dre_excel_supplementary` em `schema.sql`

Qualquer alteracao nessas areas deve ser confirmada com o usuario antes de ser feita.
Os valores da DRE foram validados contra o Power BI e batem 100%.

## Stack
- Next.js 14 (App Router) + TypeScript
- PostgreSQL (Railway production)
- Tailwind CSS + shadcn/ui
- Sienge API para dados financeiros
- Excel como fonte primaria para DRE (sync diario via Task Scheduler)
