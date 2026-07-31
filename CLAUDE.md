# CLAUDE.md — Regras do Projeto DTSIENGE

## Controle de Locações / Aluguéis — SÓ HOLDING (Validado em 2026-07-31)

Página exclusiva do modo Holding: `Financeiro > Locações > Aluguéis` (`/financeiro/alugueis`).
Réplica do Power BI `FINANCEIRO HOLDING.pbix` (páginas "ALUGUEIS À RECEBER" / "ALUGUEIS REALIZADO").

### NAO ALTERAR sem pedido explicito do usuario:
- Regra do que é aluguel em `src/lib/alugueis-utils.ts`:
  - `documentIdentificationId` ∈ {LOC, LNC} **E** alguma `paymentsCategories[].financialCategoryId` ∈ {10513, 10514}
  - 10513 = Receita de locação Pessoa Física · 10514 = Receita de locação Pessoa Jurídica
- Imóvel = `documentNumber` do título (é onde o Sienge guarda o nome do imóvel)
- Realizado = soma de `payments[].netAmount` por `paymentDate`
- A Receber = `correctedBalanceAmount - discountAmount` (NÃO subtrair taxAmount — isso é regra de CP)
- Escopo: 3 empresas (Holding, Silva Packer, Sul Brasil) — as que têm contrato de locação

### Isolamento (regra dura)
- `alugueis-utils.ts` e `alugueis-view.tsx` NÃO são importados por nenhuma tela das demais
  empresas. As fórmulas são duplicadas de propósito (não reutilizam `dashboard-utils`)
- Sidebar: item adicionado só quando `isHolding` — em modo SP o menu volta intacto
- Snapshot em `validations/holding/alugueis.json` (subdiretório de propósito:
  `check-validations.js` só lê `validations/*.json` da raiz)
- Conferência: `node scripts/valida-alugueis.js` → deve dar 0 divergências

Validado contra o Power BI (recorte 01/01/2026 a 11/06/2026, última baixa do CSV do BI):
Total R$ 2.328.855,21 · Silva Packer R$ 1.444.930,96 · Holding R$ 473.940,83 · Sul Brasil R$ 409.983,42

## Controle de Orçamento por Empresa (Criado em 2026-04-16)

- Campo `controla_orcamento` (BOOLEAN) na tabela `company_settings` (default FALSE)
- Configurado em Cadastros > Empreendimentos (coluna "Controla Orçamento", badge Sim/Não)
- Só destaca em vermelho (bg-red-50 + border-red-300) as parcelas em Contas a Pagar/Vencidas/Pagas de empresas com `controlaOrcamento=true` que não têm Item de Orçamento vinculado
- A legenda clicável acima da tabela só aparece quando há parcelas destacadas (empresas controladas com buildingsCosts vazio/sem costEstimationSheetName)
- Clique na legenda aplica/limpa o filtro "(Sem item)" do Item Orçamento

## Contas a Pagar / Vencidas - Regra de Saldo (Validado em 2026-04-16)

### NAO ALTERAR sem pedido explicito do usuario:
- Coluna "Saldo" (A Pagar) e "Total" (Vencidas) em `src/components/contas-table.tsx`:
  - Fórmula: `correctedBalanceAmount - discountAmount - taxAmount` (só para outcome, isIncome=false)
  - `taxAmount` = imposto retido (ISS/INSS) que será deduzido do pagamento ao credor
  - Validado contra Sienge "Contas a Pagar (por Credor) Sintético" — coluna "Desconto" do relatório é o taxAmount
  - Campo `discountAmount` do /outcome é 0 para parcelas abertas — o ajuste real vem do taxAmount
- KPI card "Saldo Pendente" usa o mesmo cálculo via totalBalance
- Para Income (Contas a Receber/Recebidas) NÃO subtrair taxAmount (isIncome branch)

### Atualizacao 2026-05-09 - saldo parcial com imposto
- Regra implementada em `src/lib/dashboard-utils.ts` (`effectiveOpenAmount`):
  - Base: `correctedBalanceAmount - discountAmount`
  - Para outcome, `taxAmount` so e subtraido quando `originalAmount == correctedBalanceAmount` (parcela integralmente aberta)
  - Em saldo parcial, `taxAmount` pode pertencer ao titulo original e o Sienge "Contas a Pagar (por Credor) Sintetico" nao subtrai do saldo aberto
  - Validado no EDIFICIO 135 JARDINS vencidas ate 08/05/2026: PDF R$ 248.502,25 vs sistema R$ 248.502,26. Caso critico: R M FERNANDEZ bill 34134, saldo R$ 39.990,46, taxAmount R$ 21.497,05, PDF soma R$ 39.990,46.

## Contas Pagas - Regras Criticas (Validado em 2026-04-05)

### NAO ALTERAR sem pedido explicito do usuario:
- Formula do `paidTotal` em `src/components/contas-table.tsx`:
  - Valor liquido = `netAmount` (NAO subtrair taxAmount — taxAmount é imposto retido)
  - Tipos de operação excluídos são controlados pelo filtro UI "Tipo Operação" (não hardcoded)
  - Devoluções, Abatimentos e Por Bens ficam desmarcados por padrão no filtro
  - O filtro de Tipo Operação é salvo POR EMPRESA no localStorage
  - Bank movements avulsos (detachedOnly=S) são incluídos como parcelas extras
  - Bank movements de rendimento/aplicação/resgate são excluídos
- Coluna "Tipo Op." na tabela mostra o tipo de operação de cada pagamento
- O total deve bater com o relatório Sienge "Contas Pagas (por Data) Sintético" com:
  - Processar parcelas: Ambos (Contas a Pagar + Caixa/Bancos)
  - Tarifas bancárias ref. cobrança escritural: marcado

## Orçamento - Regras Criticas (Validado em 2026-04-02, alinhado com Contas Pagas em 2026-05-13)

### NAO ALTERAR sem pedido explicito do usuario:
- Formula do Realizado em `src/components/executive-dashboard.tsx` (budgetData useMemo):
  - Valor liquido = `netAmount` (NAO subtrair taxAmount)
  - Usa `consistentItemsForPagas` (inclui BMs avulsos sintetizados — mesma fonte da pagina Contas Pagas)
  - Exclusao hardcoded de documentos de previsao (PREVISÃO/PREVISAO)
  - Exclusao hardcoded de op types: Substituicao/Cancelamento/Abatimento/Devolucao/Por Bens/Permuta (mesmos defaults da pagina Contas Pagas)
  - Exclusao NAO depende de estado de filtros (sem race condition)
- Formula do Orcado: `areaM2 * factor * cubValue`
- Formula do A Realizar: `budget - realized`
- Formula do % Realizado: `(realized / budget) * 100`
- Ordenacao: empresas Finalizadas sempre no final

## DRE - Regras Criticas (Validado em 2026-03-17)

### NAO ALTERAR sem pedido explicito do usuario:
- Formulas de calculo da DRE em `src/components/dre-tab.tsx` (lucroBruto, lucroOperacional, lucroLiquido, saldo, variacaoCaixa)
- Categorias negativas (NEGATIVE_CATEGORIES) em `src/components/dre-tab.tsx`
- Exclusao da empresa Holding nos fetches de DRE (`excludeCompanies=SILVA ADMINISTRADORA HOLDING LTDA`)
- Logica de parsing do Excel em `scripts/sync-excel-to-production.js`
- Funcoes getDreExcelData / saveDreExcelData em `src/lib/db.ts`
- Ordem e composicao das DRE_LINES
- Schema da tabela `dre_excel_supplementary` em `schema.sql`
- DRE mostra TODAS empresas (ignora filtro de empresa) para bater com Power BI
- 4 niveis de drill-down: Categoria > Conta Financeira > Credor/Cliente > Transações

Os valores da DRE foram validados contra o Power BI e batem 100%.

## Saldos Bancários - Regras (Validado em 2026-04-02)

### NAO ALTERAR sem pedido explicito do usuario:
- Mapeamento DimBanco (conta → banco) em `src/app/api/sienge/bank-accounts/route.ts`
- Mapeamento DIMBAN_ACCOUNT_COMPANY (conta → empresa) no mesmo arquivo
- Conta CAIXA só aparece para Silva Packer (companyId=1)
- Contas faltantes da API são preenchidas do cache PostgreSQL (cached_daily_balances)
- Filtro de contas salvo por empresa no localStorage
- Gráfico de evolução diária com cache no banco (dias passados não mudam)

## Resumo Financeiro - Regras (Criado em 2026-04-05)

- Total Pago usa filtro de Tipo Operação do próprio Resumo (não per-company)
- Total Recebido vem de income payments (netAmount > 0)
- Lucro Realizado = Total Recebido - Total Pago
- Coluna Disp. conta apenas unidades tipo Apartamento (exclui vagas, salas, lojas)
- Empresas Finalizadas sempre no final da tabela (case-insensitive)
- Status Ativa/Finalizada vem de Configurações > Empreendimentos

## Visão Geral - Regras (Criado em 2026-04-01)

- Aba padrão ao abrir o Painel Executivo
- Saldo Bancário carregado junto com a Visão Geral (não só na aba Saldos)
- Fluxo de Caixa Projetado: saldo atual + recebimentos previstos - pagamentos previstos
- Período selecionável: 30d, 60d, 90d, 4m, 6m, 1a
- Dois modos de gráfico: Projetado (área) e Entradas x Saídas (barras + linha)
- Insight cards: Ponto Crítico, Cobertura de Caixa, Saldo projetado no final

## Filtros por Aba

- Cada aba tem seu próprio filtro de empresas salvo no localStorage
- Chave: `dashboard_companies_{tabGroup}` onde tabGroup = cp|cr|orcamento|comercial|dre|saldos|visao-geral|resumo
- CP (a-pagar, pagas, atrasadas) compartilham filtro
- CR (a-receber, recebidas, inadimplencia) compartilham filtro
- Demais abas têm filtro independente

## Autenticação

- NextAuth com dois providers: Google OAuth + Credentials
- Credentials: verifica env vars (ADMIN_USERNAME/PASSWORD) depois banco PostgreSQL (tabela users)
- Senhas em bcrypt hash
- Usuários criados via script: `node scripts/seed-user.js "Nome" "email" "senha"`
- Seed automático no migrate.js para usuários padrão

## Dark Mode

- next-themes com classe "dark" no HTML
- Botão sol/lua no header para alternar
- Vermelho suave no dark: `dark:text-red-300/60` ou `dark:text-red-300/70`
- SVG charts usam #f87171 (red-400) em vez de #ef4444/#dc2626

## Stack
- Next.js 14 (App Router) + TypeScript
- PostgreSQL (Railway production)
- Tailwind CSS + shadcn/ui
- Sienge API para dados financeiros (outcome, income, bank-movements, accounts-balances, companies, units, sales-contracts)
- Excel como fonte primaria para DRE (sync diario via Task Scheduler)
- next-themes para dark mode
- bcryptjs para hash de senhas
- Recharts para gráficos (BarChart, AreaChart, ComposedChart, LineChart)
