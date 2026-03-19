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

## Orcamento - Regras Criticas (Validado em 2026-03-18)

### NAO ALTERAR sem pedido explicito do usuario:
- Formula do Realizado em `src/components/executive-dashboard.tsx` (budgetData useMemo):
  - Valor liquido = `netAmount - taxAmount` (nunca usar netAmount sozinho)
  - Exclusao hardcoded de documentos de previsao (PREVISÃO/PREVISAO)
  - Exclusao NAO depende de estado de filtros (sem race condition)
  - Dependencies do useMemo: `[cubData, companySettings, consistentItems, selectedYears, selectedCompanies]`
- Formula do paidTotal em `src/components/contas-table.tsx`:
  - Mesmo calculo: `netAmount - taxAmount` para valor liquido
  - Deve sempre bater com coluna "Liquido" do Sienge "Contas Pagas Sintetico"
- Formula do Orcado: `areaM2 * factor * cubValue`
- Formula do A Realizar: `budget - realized`
- Formula do % Realizado: `(realized / budget) * 100`
- Ordenacao: empresas Finalizadas sempre no final

Qualquer alteracao nessas areas deve ser confirmada com o usuario antes de ser feita.
Os valores do Orcamento foram validados contra Contas Pagas e batem 100%.

## Stack
- Next.js 14 (App Router) + TypeScript
- PostgreSQL (Railway production)
- Tailwind CSS + shadcn/ui
- Sienge API para dados financeiros
- Excel como fonte primaria para DRE (sync diario via Task Scheduler)
