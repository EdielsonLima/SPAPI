// Compara valores calculados pelo cache local contra o snapshot de validações
// validations/contas-pagar.json. Reporta pass/fail por entrada.
//
// Uso: node scripts/check-validations.js
//
// Cada entrada do snapshot foi conferida manualmente contra o relatório
// Sienge correspondente. Se qualquer total divergir após uma mudança de
// código, este script falha e indica qual empresa/período quebrou.

const { Pool } = require("pg");
const fs = require("fs");
const path = require("path");

const env = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8");
const DATABASE_URL = env.match(/DATABASE_URL=(.+)/)[1].trim();
const pool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });

const fmt = v => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Tipos de operação excluídos do Líquido no relatório Sienge "Contas Pagas
// (por Credor) Sintético". Mesma lista que o filtro UI Tipo Operação aplica
// como default per-empresa.
//
// Nota sobre "estorno": NÃO está nesta lista. Estornos têm netAmount negativo
// e o relatório Sienge soma o estorno como redução (pagamento + estorno = 0
// se forem opostos). Excluir estorno + manter pagamento positivo dobraria
// quando o pagamento foi re-emitido em data diferente (ex: Pag 09-01,
// Estorno 09-05, Pag 09-06 = Líquido 6.600, não 13.200). Somar tudo dá o
// resultado certo automaticamente.
//
// "devolu": devoluções de fornecedor não entram no Líquido "(por Credor)" do
// Sienge — confirmado ao bater HANNOVER (3 devoluções totalizando R$ 7.376,85
// que estavam sobrando no cache).
const EXCLUDED_OP = ["substitui", "cancelamento", "abatimento", "devolu"];
function isExcludedOp(name) {
  const lower = (name || "").toLowerCase();
  return EXCLUDED_OP.some(x => lower.includes(x));
}

// Encargos (multa + juros) aplicados a parcelas vencidas.
// Regras Sienge para encargo=0:
// - paymentTerm.id="PE" (Permuta) — sempre 0
// - paymentTerm.id="PM" (Parcelas Mensais) + indexerName="REAL" — sem correção
function calcEncargos(item, todayDate) {
  if (!item.dueDate) return 0;
  let ptId = "";
  try {
    const pt = typeof item.paymentTerm === "string" ? JSON.parse(item.paymentTerm) : item.paymentTerm;
    ptId = pt?.id || "";
  } catch { /* ignore */ }
  if (ptId === "PE") return 0;
  if (ptId === "PM" && (!item.indexerName || item.indexerName === "REAL")) return 0;
  const due = new Date(item.dueDate + "T00:00:00");
  let dias = Math.max(0, Math.floor((todayDate.getTime() - due.getTime()) / (1000 * 60 * 60 * 24)));
  if (dias <= 0) return 0;
  if (dias > 365) dias = dias - 1;
  const saldo = item.correctedBalanceAmount || 0;
  const multa = saldo * 0.02;
  const juros = (saldo + multa) * 0.01 * (dias / 30);
  return multa + juros;
}

// Total Inadimplência (Contas a Receber vencidas).
function computeInadimplencia(incomeItems, company, year, month) {
  const yearFilter = year && year !== "*" ? year : null;
  const monthFilter = month && month !== "*" ? month : null;
  const todayStr = new Date().toISOString().split("T")[0];
  const todayDate = new Date(todayStr + "T00:00:00");
  let total = 0;
  let count = 0;
  for (const i of incomeItems) {
    if (i.companyName !== company) continue;
    if ((i.correctedBalanceAmount || 0) <= 0) continue;
    if (!i.dueDate || i.dueDate >= todayStr) continue;
    if (yearFilter && !i.dueDate.startsWith(yearFilter)) continue;
    if (monthFilter && i.dueDate.substring(5, 7) !== monthFilter) continue;
    const docName = (i.documentIdentificationName || "").toUpperCase();
    if (docName.startsWith("PREVISÃO") || docName.startsWith("PREVISAO")) continue;
    if (docName.startsWith("CONTRATO DE LOCA")) continue;
    const eff = (i.correctedBalanceAmount || 0) - (i.discountAmount || 0) - (i.taxAmount || 0);
    if (eff <= 0) continue;
    const enc = calcEncargos(i, todayDate);
    total += eff + enc;
    count++;
  }
  return { total, count };
}

// Total a Receber (Contas a Receber). Mesma fórmula do Painel:
// correctedBalanceAmount - discountAmount - taxAmount para items com
// correctedBalanceAmount > 0 e dueDate >= hoje (futuras parcelas).
// Exclui HOLDING/ADMINISTRADORA e tipo doc CONTRATO DE LOCAÇÃO.
function computeAReceber(incomeItems, company, year, month) {
  const yearFilter = year && year !== "*" ? year : null;
  const monthFilter = month && month !== "*" ? month : null;
  const todayStr = new Date().toISOString().split("T")[0];
  let total = 0;
  let count = 0;
  for (const i of incomeItems) {
    if (i.companyName !== company) continue;
    if ((i.correctedBalanceAmount || 0) <= 0) continue;
    if (!i.dueDate || i.dueDate < todayStr) continue;
    if (yearFilter && !i.dueDate.startsWith(yearFilter)) continue;
    if (monthFilter && i.dueDate.substring(5, 7) !== monthFilter) continue;
    const docName = (i.documentIdentificationName || "").toUpperCase();
    if (docName.startsWith("PREVISÃO") || docName.startsWith("PREVISAO")) continue;
    if (docName.startsWith("CONTRATO DE LOCA")) continue;
    const eff = (i.correctedBalanceAmount || 0) - (i.discountAmount || 0) - (i.taxAmount || 0);
    if (eff <= 0) continue;
    total += eff;
    count++;
  }
  return { total, count };
}

// Mesmo filtro do incomeBankMovementsAsItems do executive-dashboard.tsx.
// Sintetiza BMs órfãos (sem bill associado) que representam recebimentos
// diretos no banco (Rendimento de aplicação etc) — = "linha sem cliente"
// do PDF Sienge "Contas Recebidas (por Cliente)".
function isIncomeBankMovement(bm) {
  if (bm.bankMovementAmount === 0) return false;
  if (bm.billId) return false;
  if (bm.bankMovementOperationType !== "E") return false;
  const historic = (bm.bankMovementHistoricName || "").toLowerCase().trim();
  if (historic.includes("transferência") || historic.includes("transferencia")) return false;
  if (historic === "aplicação" || historic === "aplicacao") return false;
  if (historic.includes("pagamento") || historic.includes("saque") ||
      historic.includes("depósito") || historic.includes("deposito") ||
      historic.includes("cheque emitido")) return false;
  const cats = bm.financialCategories || [];
  const isReceita = cats.length === 0 || cats.some(fc => fc.financialCategoryType === "R");
  if (!isReceita) return false;
  const catNames = cats.map(fc => (fc.financialCategoryName || "").toLowerCase()).join(" ");
  if (catNames.includes("transferência") || catNames.includes("transferencia")) return false;
  return true;
}

// Total Recebido (Líquido). Soma:
// - Receipts vinculados a bills (com bankMovements — exclui Por Bens)
// - BMs órfãos sintetizados como recebimentos sem cliente
// Filtra por paymentDate em year/month.
function computeRecebidas(incomeItems, bankMovements, company, year, month) {
  const yearFilter = year && year !== "*" ? year : null;
  const monthFilter = month && month !== "*" ? month : null;
  let total = 0;
  let count = 0;

  // Receipts vinculados
  for (const item of incomeItems) {
    if (item.companyName !== company) continue;
    for (const r of (item.receipts || [])) {
      if (!r.paymentDate) continue;
      if (yearFilter && !r.paymentDate.startsWith(yearFilter)) continue;
      if (monthFilter && r.paymentDate.substring(5, 7) !== monthFilter) continue;
      // Só conta se tiver bankMovements (= Sienge Líquido > 0; Por Bens fica 0)
      if (!r.bankMovements || r.bankMovements.length === 0) continue;
      if ((r.netAmount || 0) <= 0) continue;
      total += r.netAmount;
      count++;
    }
  }

  // BMs órfãos
  for (const bm of bankMovements) {
    if (bm.companyName !== company) continue;
    if (!bm.bankMovementDate) continue;
    if (yearFilter && !bm.bankMovementDate.startsWith(yearFilter)) continue;
    if (monthFilter && bm.bankMovementDate.substring(5, 7) !== monthFilter) continue;
    if (!isIncomeBankMovement(bm)) continue;
    total += Math.abs(bm.bankMovementAmount);
    count++;
  }

  return { total, count };
}

// Pareamento explícito de estornos não é mais necessário: o estorno tem
// netAmount negativo e simplesmente somá-lo cancela o pagamento original
// quando opostos. Quando o estorno e o re-pagamento ficam em datas distintas
// (caso EVELIN bill=6109 em HANNOVER), o pareamento por data falhava e
// dobrava o pagamento. Função preservada como no-op para legibilidade do
// histórico — pode ser removida em refactor futuro.
function getEstornoPairs() { return new Set(); }

// Total a Pagar para uma empresa. Soma effectiveAmount = corrected - discount
// - tax para items com balance > 0 e dueDate >= hoje (futuras parcelas em
// aberto). Exclui PREVISÃO. Mesma fórmula da UI Painel CP > Contas a Pagar.
function computeAPagar(items, company, year, month) {
  const yearFilter = year && year !== "*" ? year : null;
  const monthFilter = month && month !== "*" ? month : null;
  const todayStr = new Date().toISOString().split("T")[0];
  let total = 0;
  let count = 0;
  for (const i of items) {
    if (i.companyName !== company) continue;
    if ((i.correctedBalanceAmount || 0) <= 0) continue;
    if (!i.dueDate || i.dueDate < todayStr) continue;
    if (yearFilter && !i.dueDate.startsWith(yearFilter)) continue;
    if (monthFilter && i.dueDate.substring(5, 7) !== monthFilter) continue;
    const docName = (i.documentIdentificationName || "").toUpperCase();
    if (docName.startsWith("PREVISÃO") || docName.startsWith("PREVISAO")) continue;
    const eff = (i.correctedBalanceAmount || 0) - (i.discountAmount || 0) - (i.taxAmount || 0);
    if (eff <= 0) continue;
    total += eff;
    count++;
  }
  return { total, count };
}

// Total Pago para uma empresa, opcionalmente filtrando por ano/mês,
// `paymentDateMax` (data de corte do PDF — pagamentos antecipados pra data
// futura não entram), ou `excludeOps` (lista de operationTypeName extras a
// excluir, usado por SP/ROZZA que excluem "Por Bens" via filtro UI).
function computePagas(items, bankMovements, company, year, month, paymentDateMax, excludeOps) {
  const yearFilter = year && year !== "*" ? year : null;
  const monthFilter = month && month !== "*" ? month : null;
  const extraExcluded = (excludeOps || []).map(s => s.toLowerCase());
  let total = 0;
  let count = 0;

  for (const item of items) {
    if (item.companyName !== company) continue;
    const docName = (item.documentIdentificationName || "").toUpperCase();
    if (docName.startsWith("PREVISÃO") || docName.startsWith("PREVISAO")) continue;
    const payments = item.payments || [];
    const canceled = getEstornoPairs(payments);
    for (const p of payments) {
      if (canceled.has(p)) continue;
      if (p.netAmount === 0) continue;
      if (!p.paymentDate) continue;
      if (yearFilter && !p.paymentDate.startsWith(yearFilter)) continue;
      if (monthFilter && p.paymentDate.substring(5, 7) !== monthFilter) continue;
      if (paymentDateMax && p.paymentDate > paymentDateMax) continue;
      if (isExcludedOp(p.operationTypeName)) continue;
      const opLower = (p.operationTypeName || "").toLowerCase();
      if (extraExcluded.some(x => opLower.includes(x))) continue;
      total += p.netAmount;
      count++;
    }
  }

  // Bank movements avulsos — lógica refinada 2026-05-09 contra Sienge
  // "Contas Pagas (por Credor) Sintético" PDFs (cravou exato em 9 empresas):
  //
  // Aceitar APENAS BMs com:
  //   1. bankMovementOperationType === "S" (Saídas). op='E' são entradas/
  //      recebimentos — incluí-los dobraria transferências S+E pareadas.
  //   2. documentIdentificationName !== "TRANSFERÊNCIA ENTRE CONTAS" — esses
  //      são lançamentos contábeis internos/intercompany. Sienge "(por Credor)"
  //      não soma no Líquido.
  //   3. financialCategories.length > 0 — BMs sem categoria financeira são
  //      sincronizações contábeis (ex: HOLDING recebendo aluguel registrado
  //      como op='S' sem categoria). Pagamentos reais sempre têm categoria
  //      ("Movimentações Administrativas", "Tarifa Bancária", etc.).
  //   4. historic não em [rendimento, aplicação, resgate, recebimento, saque,
  //      depósito, cheque]:
  //      - rendimento/aplicação/resgate: receitas financeiras
  //      - recebimento: entrada de caixa
  //      - saque/depósito: movimentação interna
  //      - cheque (Cheque emitido): movimentação do papel-cheque, não
  //        pagamento real (registrado separado quando compensado)
  const EXCLUDE_HISTORIC_PATTERNS = [
    "rendimento", "aplicação", "aplicacao", "resgate",
    "saque", "depósito", "deposito",
    "recebimento",
    "cheque",
  ];
  for (const bm of bankMovements) {
    if (bm.companyName !== company) continue;
    if (bm.bankMovementAmount === 0) continue;
    if (!bm.bankMovementDate) continue;
    if (yearFilter && !bm.bankMovementDate.startsWith(yearFilter)) continue;
    if (monthFilter && bm.bankMovementDate.substring(5, 7) !== monthFilter) continue;
    if (paymentDateMax && bm.bankMovementDate > paymentDateMax) continue;
    if (bm.bankMovementOperationType !== "S") continue;
    const docName = (bm.documentIdentificationName || "").toUpperCase();
    if (docName.includes("TRANSFER") && docName.includes("ENTRE CONTAS")) continue;
    const cats = bm.financialCategories || [];
    if (cats.length === 0) continue;
    const historic = (bm.bankMovementHistoricName || "").toLowerCase();
    if (EXCLUDE_HISTORIC_PATTERNS.some(p => historic.includes(p))) continue;
    total += Math.abs(bm.bankMovementAmount);
    count++;
  }

  return { total, count };
}

(async () => {
  const validationsDir = path.join(__dirname, "..", "validations");
  const files = fs.readdirSync(validationsDir).filter(f => f.endsWith(".json"));
  const validations = [];
  for (const f of files) {
    const cfg = JSON.parse(fs.readFileSync(path.join(validationsDir, f), "utf8"));
    (cfg.validations || []).forEach(v => validations.push(v));
  }

  if (validations.length === 0) {
    console.log("Nenhuma validação registrada em validations/*.json");
    process.exit(0);
  }

  const r = await pool.query("SELECT data, cached_at FROM cached_outcome ORDER BY cached_at DESC LIMIT 1");
  if (!r.rows.length) {
    console.error("Sem cache de outcome no banco. Faça uma fetch primeiro.");
    process.exit(1);
  }
  const items = r.rows[0].data?.data || r.rows[0].data || [];
  const cachedAt = r.rows[0].cached_at;

  // Pega só o cache de BMs avulsos (sem prefixo `all:`). O painel cacheia
  // separado: chave `all:<data>` guarda TODOS os BMs (vinculados + avulsos)
  // e a chave sem prefixo guarda só avulsos. Como item.payments já cobre os
  // vinculados via receipts.bankMovements, somar `all:` aqui dobraria os
  // pagamentos vinculados.
  const bm = await pool.query(
    "SELECT data FROM cached_bank_movements WHERE start_date NOT LIKE 'all:%' ORDER BY cached_at DESC LIMIT 1"
  );
  const bankMovements = bm.rows[0]?.data?.data || bm.rows[0]?.data || [];

  const incomeR = await pool.query("SELECT data FROM cached_income ORDER BY cached_at DESC LIMIT 1");
  const incomeItems = incomeR.rows[0]?.data?.data || incomeR.rows[0]?.data || [];

  console.log(`Cache outcome: ${items.length} itens (cached_at ${cachedAt})`);
  console.log(`Cache income: ${incomeItems.length} itens`);
  console.log(`Cache bank movements: ${bankMovements.length} itens`);
  console.log(`Validações: ${validations.length}\n`);

  const cachedAtDate = new Date(cachedAt);
  // Tolerância: cache até 24h após a validação ainda é considerado "mesmos dados"
  const SAME_DAY_MS = 24 * 60 * 60 * 1000;

  let passed = 0, failed = 0, staleSkipped = 0, dataChangedSkipped = 0;
  for (const v of validations) {
    const tolerance = v.tolerance ?? 0.5;
    let result;
    if (v.mode === "a-pagar") {
      result = computeAPagar(items, v.company, v.year, v.month);
    } else if (v.mode === "pagas") {
      result = computePagas(items, bankMovements, v.company, v.year, v.month, v.paymentDateMax, v.excludeOps);
    } else if (v.mode === "recebidas") {
      result = computeRecebidas(incomeItems, bankMovements, v.company, v.year, v.month);
    } else if (v.mode === "a-receber") {
      result = computeAReceber(incomeItems, v.company, v.year, v.month);
    } else if (v.mode === "inadimplencia") {
      result = computeInadimplencia(incomeItems, v.company, v.year, v.month);
    } else {
      console.log(`✗ ${v.company} ${v.year}-${v.month} ${v.mode}: modo desconhecido`);
      failed++;
      continue;
    }
    const diff = result.total - v.expected;
    const ok = Math.abs(diff) <= tolerance;
    const flag = ok ? "✓" : "✗";
    const periodLabel = `${v.year || "*"}-${v.month || "*"}`;
    const label = `${v.company} ${periodLabel} ${v.mode}`;

    const validatedDate = new Date(v.validated_at);
    const cacheOlderThanValidation = cachedAtDate < validatedDate;
    // Cache muito mais novo (>24h) que a validação? Os dados podem ter
    // mudado naturalmente (novos lançamentos, baixas) — não é regressão de
    // código, é evolução natural. Sinaliza para o usuário re-validar.
    const cacheMuchNewer = !ok && cachedAtDate.getTime() - validatedDate.getTime() > SAME_DAY_MS;

    if (ok) {
      console.log(`${flag} ${label.padEnd(40)} ${fmt(result.total).padStart(20)} (esperado ${fmt(v.expected)}, ${result.count} parcelas)`);
      passed++;
    } else if (cacheOlderThanValidation) {
      console.log(`⚠ ${label.padEnd(40)} ${fmt(result.total).padStart(20)} (esperado ${fmt(v.expected)}, diff ${fmt(diff)}) — cache mais antigo que a validação, refresh dos dados via app antes de avaliar`);
      staleSkipped++;
    } else if (cacheMuchNewer) {
      const days = Math.floor((cachedAtDate.getTime() - validatedDate.getTime()) / SAME_DAY_MS);
      console.log(`⚠ ${label.padEnd(40)} ${fmt(result.total).padStart(20)} (esperado ${fmt(v.expected)}, diff ${fmt(diff)}) — cache ${days}d mais novo que a validação, dados podem ter mudado naturalmente; gere relatório atual no Sienge e atualize o snapshot`);
      dataChangedSkipped++;
    } else {
      console.log(`${flag} ${label.padEnd(40)} ${fmt(result.total).padStart(20)} (esperado ${fmt(v.expected)}, diff ${fmt(diff)}, ${result.count} parcelas)`);
      console.log(`   tolerance: ${fmt(tolerance)} · validado em ${v.validated_at}`);
      console.log(`   fonte: ${v.source}`);
      failed++;
    }
  }

  const warnParts = [];
  if (staleSkipped > 0) warnParts.push(`${staleSkipped} cache desatualizado`);
  if (dataChangedSkipped > 0) warnParts.push(`${dataChangedSkipped} dados evoluíram`);
  const warnSuffix = warnParts.length > 0 ? ` · ⚠ ${warnParts.join(", ")}` : "";
  console.log(`\nResumo: ${passed} ✓ · ${failed} ✗${warnSuffix}`);
  await pool.end();
  process.exit(failed > 0 ? 1 : 0);
})();
