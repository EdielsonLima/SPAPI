import { Pool } from "pg";

const databaseUrl = process.env.DATABASE_URL || "";
const needsSsl =
  databaseUrl.includes("railway.app") ||
  databaseUrl.includes("neon.tech") ||
  databaseUrl.includes("supabase.co");

const pool = new Pool({
  connectionString: databaseUrl,
  ...(needsSsl ? { ssl: { rejectUnauthorized: false } } : {}),
});

// ─── Delivery Status ──────────────────────────────────────────────────────────

export async function getCachedDeliveryStatuses(orderIds: number[]): Promise<Record<number, string>> {
  if (orderIds.length === 0) return {};
  const placeholders = orderIds.map((_, i) => `$${i + 1}`).join(",");
  const result = await pool.query(
    `SELECT order_id, delivery_status FROM cached_delivery_status WHERE order_id IN (${placeholders})`,
    orderIds
  );
  const map: Record<number, string> = {};
  result.rows.forEach((row: { order_id: number; delivery_status: string }) => {
    map[row.order_id] = row.delivery_status;
  });
  return map;
}

export async function cacheDeliveryStatus(
  orderId: number,
  deliveryStatus: string,
  orderStatus: string,
  totalItems: number,
  totalDelivered: number,
  totalPending: number
) {
  await pool.query(
    `INSERT INTO cached_delivery_status (order_id, delivery_status, order_status, total_items, total_delivered, total_pending, cached_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW())
     ON CONFLICT (order_id) DO UPDATE SET
       delivery_status = $2, order_status = $3, total_items = $4, total_delivered = $5, total_pending = $6, cached_at = NOW()`,
    [orderId, deliveryStatus, orderStatus, totalItems, totalDelivered, totalPending]
  );
}

// ─── Companies ────────────────────────────────────────────────────────────────

export async function getCachedCompanies(): Promise<{ id: number; name: string }[]> {
  const result = await pool.query(`SELECT id, name FROM cached_companies ORDER BY id`);
  return result.rows;
}

export async function getCachedCompanyById(id: number): Promise<string | null> {
  const result = await pool.query(`SELECT name FROM cached_companies WHERE id = $1`, [id]);
  return result.rows.length > 0 ? result.rows[0].name : null;
}

export async function cacheCompanies(companies: { id: number; name: string }[]) {
  if (companies.length === 0) return;
  const values = companies.map((_, i) => `($${i * 2 + 1}, $${i * 2 + 2}, NOW())`).join(",");
  const params = companies.flatMap((c) => [c.id, c.name]);
  await pool.query(
    `INSERT INTO cached_companies (id, name, cached_at) VALUES ${values}
     ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, cached_at = NOW()`,
    params
  );
}

// ─── Cost Centers ─────────────────────────────────────────────────────────────

export async function getCachedCostCenters(): Promise<{ id: number; name: string; cnpj?: string; idCompany?: number }[]> {
  const result = await pool.query(`SELECT id, name, cnpj, id_company FROM cached_cost_centers ORDER BY id`);
  return result.rows.map((r: { id: number; name: string; cnpj: string | null; id_company: number | null }) => ({
    id: r.id,
    name: r.name,
    ...(r.cnpj ? { cnpj: r.cnpj } : {}),
    ...(r.id_company ? { idCompany: r.id_company } : {}),
  }));
}

export async function cacheCostCenters(centers: { id: number; name: string; cnpj?: string; idCompany?: number }[]) {
  if (centers.length === 0) return;
  const values = centers.map((_, i) => `($${i * 4 + 1}, $${i * 4 + 2}, $${i * 4 + 3}, $${i * 4 + 4}, NOW())`).join(",");
  const params = centers.flatMap((c) => [c.id, c.name, c.cnpj || null, c.idCompany || null]);
  await pool.query(
    `INSERT INTO cached_cost_centers (id, name, cnpj, id_company, cached_at) VALUES ${values}
     ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, cnpj = EXCLUDED.cnpj, id_company = EXCLUDED.id_company, cached_at = NOW()`,
    params
  );
}

// ─── Creditors (Fornecedores) ─────────────────────────────────────────────────

export async function getCachedCreditors(): Promise<{ id: number; name: string }[]> {
  const result = await pool.query(`SELECT id, name FROM cached_creditors ORDER BY name`);
  return result.rows;
}

export async function getCachedCreditorsByIds(ids: number[]): Promise<Record<number, string>> {
  if (ids.length === 0) return {};
  const placeholders = ids.map((_, i) => `$${i + 1}`).join(",");
  const result = await pool.query(
    `SELECT id, name FROM cached_creditors WHERE id IN (${placeholders})`,
    ids
  );
  const map: Record<number, string> = {};
  result.rows.forEach((row: { id: number; name: string }) => {
    map[row.id] = row.name;
  });
  return map;
}

export async function cacheCreditors(creditors: { id: number; name: string }[]) {
  if (creditors.length === 0) return;
  const values = creditors.map((_, i) => `($${i * 2 + 1}, $${i * 2 + 2}, NOW())`).join(",");
  const params = creditors.flatMap((c) => [c.id, c.name]);
  await pool.query(
    `INSERT INTO cached_creditors (id, name, cached_at) VALUES ${values}
     ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, cached_at = NOW()`,
    params
  );
}

// ─── Financial Plans (Plano Financeiro) ───────────────────────────────────────

export async function getCachedFinancialPlans(): Promise<{ id: string; name: string; tpConta?: string; flAtiva?: string }[]> {
  const result = await pool.query(`SELECT id, name, tp_conta, fl_ativa FROM cached_financial_plans ORDER BY name`);
  return result.rows.map((r: { id: string; name: string; tp_conta: string | null; fl_ativa: string | null }) => ({
    id: r.id,
    name: r.name,
    ...(r.tp_conta ? { tpConta: r.tp_conta } : {}),
    ...(r.fl_ativa ? { flAtiva: r.fl_ativa } : {}),
  }));
}

export async function cacheFinancialPlans(plans: { id: string; name: string; tpConta?: string; flAtiva?: string }[]) {
  if (plans.length === 0) return;
  const values = plans.map((_, i) => `($${i * 4 + 1}, $${i * 4 + 2}, $${i * 4 + 3}, $${i * 4 + 4}, NOW())`).join(",");
  const params = plans.flatMap((p) => [p.id, p.name, p.tpConta || null, p.flAtiva || null]);
  await pool.query(
    `INSERT INTO cached_financial_plans (id, name, tp_conta, fl_ativa, cached_at) VALUES ${values}
     ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, tp_conta = EXCLUDED.tp_conta, fl_ativa = EXCLUDED.fl_ativa, cached_at = NOW()`,
    params
  );
}

// ─── Order Items (Itens do Pedido) ────────────────────────────────────────────
// Cache permanente: itens raramente mudam após o pedido ser autorizado.

export async function getCachedOrderItems(orderId: number): Promise<unknown[] | null> {
  const result = await pool.query(
    `SELECT items FROM cached_order_items WHERE order_id = $1`,
    [orderId]
  );
  return result.rows.length > 0 ? result.rows[0].items : null;
}

export async function cacheOrderItems(orderId: number, items: unknown[]) {
  await pool.query(
    `INSERT INTO cached_order_items (order_id, items, cached_at) VALUES ($1, $2, NOW())
     ON CONFLICT (order_id) DO UPDATE SET items = $2, cached_at = NOW()`,
    [orderId, JSON.stringify(items)]
  );
}

// ─── Delivery Schedules (Cronogramas de Entrega) ──────────────────────────────
// - permanent=true  → sem TTL (pedidos 100% entregues com nota — nunca mudam)
// - permanent=false → TTL de 2h (pedidos parciais ou aguardando entrega)

const DELIVERY_SCHEDULE_TTL_HOURS = 2;

export async function getCachedDeliverySchedules(
  orderId: number,
  itemNumber: number,
  permanent = false
): Promise<unknown[] | null> {
  const ttlClause = permanent
    ? ""
    : `AND cached_at > NOW() - INTERVAL '${DELIVERY_SCHEDULE_TTL_HOURS} hours'`;

  const result = await pool.query(
    `SELECT schedules FROM cached_delivery_schedules
     WHERE order_id = $1 AND item_number = $2 ${ttlClause}`,
    [orderId, itemNumber]
  );
  return result.rows.length > 0 ? result.rows[0].schedules : null;
}

export async function cacheDeliverySchedules(
  orderId: number,
  itemNumber: number,
  schedules: unknown[]
) {
  await pool.query(
    `INSERT INTO cached_delivery_schedules (order_id, item_number, schedules, cached_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (order_id, item_number) DO UPDATE SET schedules = $3, cached_at = NOW()`,
    [orderId, itemNumber, JSON.stringify(schedules)]
  );
}

// ─── Purchase Orders (Pedidos de Compra) ──────────────────────────────────────
// cache_key = "startDate:endDate:limit:offset"

export async function getCachedPurchaseOrders(cacheKey: string): Promise<unknown | null> {
  const result = await pool.query(
    `SELECT data FROM cached_purchase_orders WHERE cache_key = $1`,
    [cacheKey]
  );
  return result.rows.length > 0 ? result.rows[0].data : null;
}

export async function cachePurchaseOrders(cacheKey: string, data: unknown) {
  await pool.query(
    `INSERT INTO cached_purchase_orders (cache_key, data, cached_at) VALUES ($1, $2, NOW())
     ON CONFLICT (cache_key) DO UPDATE SET data = $2, cached_at = NOW()`,
    [cacheKey, JSON.stringify(data)]
  );
}

export async function invalidatePurchaseOrdersCache(startDate: string, endDate: string) {
  await pool.query(
    `DELETE FROM cached_purchase_orders WHERE cache_key LIKE $1`,
    [`${startDate}:${endDate}:%`]
  );
}

// ─── Outcome (Contas a Pagar) ─────────────────────────────────────────────────

export async function getCachedOutcome(startDate: string, endDate: string): Promise<{ data: unknown; cachedAt: string } | null> {
  const result = await pool.query(
    `SELECT data, cached_at FROM cached_outcome WHERE start_date = $1 AND end_date = $2 AND cached_at > NOW() - INTERVAL '7 days'`,
    [startDate, endDate]
  );
  return result.rows.length > 0 ? { data: result.rows[0].data, cachedAt: result.rows[0].cached_at } : null;
}

export async function cacheOutcome(startDate: string, endDate: string, data: unknown) {
  await pool.query(
    `INSERT INTO cached_outcome (start_date, end_date, data, cached_at) VALUES ($1, $2, $3, NOW())
     ON CONFLICT (start_date, end_date) DO UPDATE SET data = $3, cached_at = NOW()`,
    [startDate, endDate, JSON.stringify(data)]
  );
}

// ─── Income (Contas a Receber) ───────────────────────────────────────────────

export async function getCachedIncome(startDate: string, endDate: string): Promise<{ data: unknown; cachedAt: string } | null> {
  const result = await pool.query(
    `SELECT data, cached_at FROM cached_income WHERE start_date = $1 AND end_date = $2 AND cached_at > NOW() - INTERVAL '7 days'`,
    [startDate, endDate]
  );
  return result.rows.length > 0 ? { data: result.rows[0].data, cachedAt: result.rows[0].cached_at } : null;
}

export async function cacheIncome(startDate: string, endDate: string, data: unknown) {
  await pool.query(
    `INSERT INTO cached_income (start_date, end_date, data, cached_at) VALUES ($1, $2, $3, NOW())
     ON CONFLICT (start_date, end_date) DO UPDATE SET data = $3, cached_at = NOW()`,
    [startDate, endDate, JSON.stringify(data)]
  );
}

// ─── Bank Movements (Movimentações Bancárias) ────────────────────────────────

export async function getCachedBankMovements(startDate: string, endDate: string): Promise<{ data: unknown; cachedAt: string } | null> {
  const result = await pool.query(
    `SELECT data, cached_at FROM cached_bank_movements WHERE start_date = $1 AND end_date = $2 AND cached_at > NOW() - INTERVAL '7 days'`,
    [startDate, endDate]
  );
  return result.rows.length > 0 ? { data: result.rows[0].data, cachedAt: result.rows[0].cached_at } : null;
}

export async function cacheBankMovements(startDate: string, endDate: string, data: unknown) {
  await pool.query(
    `INSERT INTO cached_bank_movements (start_date, end_date, data, cached_at) VALUES ($1, $2, $3, NOW())
     ON CONFLICT (start_date, end_date) DO UPDATE SET data = $3, cached_at = NOW()`,
    [startDate, endDate, JSON.stringify(data)]
  );
}

// ─── Variantes "Containing" (cache mais recente que cobre o range) ──────────
// Sem TTL (cached_at > NOW() - INTERVAL) intencionalmente — usado por
// endpoints DRE API que rodam sobre o cache populado pelo painel. Se nao
// houver cache, retorna null; o endpoint trata como "sem dados".
export async function getCachedOutcomeContaining(startDate: string, endDate: string): Promise<{ data: unknown; cachedAt: string } | null> {
  const result = await pool.query(
    `SELECT data, cached_at FROM cached_outcome
     WHERE start_date <= $1 AND end_date >= $2 AND start_date NOT LIKE 'all:%'
     ORDER BY cached_at DESC LIMIT 1`,
    [startDate, endDate]
  );
  return result.rows.length > 0 ? { data: result.rows[0].data, cachedAt: result.rows[0].cached_at } : null;
}

export async function getCachedIncomeContaining(startDate: string, endDate: string): Promise<{ data: unknown; cachedAt: string } | null> {
  const result = await pool.query(
    `SELECT data, cached_at FROM cached_income
     WHERE start_date <= $1 AND end_date >= $2 AND start_date NOT LIKE 'all:%'
     ORDER BY cached_at DESC LIMIT 1`,
    [startDate, endDate]
  );
  return result.rows.length > 0 ? { data: result.rows[0].data, cachedAt: result.rows[0].cached_at } : null;
}

export async function getCachedBankMovementsContaining(startDate: string, endDate: string): Promise<{ data: unknown; cachedAt: string } | null> {
  // Prefere cache de DETACHED (avulsos, sem billId) — pra evitar duplicacao
  // com outcome.payments[]. O cache 'all:%' inclui BMs vinculados a bills
  // (que ja contam em outcome.payments) e BMs de "Reapropriacao de valores
  // no abatimento de adiantamento" que sao apenas registros contabeis —
  // somando os dois dobra a despesa. Validado 2026-05-13 com conta
  // 202020417 (Imobilizado) GALPAO RUA CANELINHA.
  const det = await pool.query(
    `SELECT data, cached_at FROM cached_bank_movements
     WHERE start_date <= $1 AND end_date >= $2 AND start_date NOT LIKE 'all:%'
     ORDER BY cached_at DESC LIMIT 1`,
    [startDate, endDate]
  );
  if (det.rows.length > 0) {
    return { data: det.rows[0].data, cachedAt: det.rows[0].cached_at };
  }
  // Fallback: cache `all:%` (inclui BMs vinculados — pode causar duplicacao,
  // mas e melhor que nada se for o unico disponivel).
  const all = await pool.query(
    `SELECT data, cached_at FROM cached_bank_movements
     WHERE start_date <= $1 AND end_date >= $2 AND start_date LIKE 'all:%'
     ORDER BY cached_at DESC LIMIT 1`,
    [`all:${startDate}`, `all:${endDate}`]
  );
  return all.rows.length > 0 ? { data: all.rows[0].data, cachedAt: all.rows[0].cached_at } : null;
}

// ─── Sales Contracts (Contratos de Vendas) ──────────────────────────────────

let salesTableReady = false;
export async function ensureSalesContractsTable() {
  if (salesTableReady) return;
  await pool.query(`CREATE TABLE IF NOT EXISTS cached_sales_contracts (
    id SERIAL PRIMARY KEY, data JSONB NOT NULL, cached_at TIMESTAMP NOT NULL DEFAULT NOW()
  )`);
  salesTableReady = true;
}

export async function getCachedSalesContracts(): Promise<{ data: unknown; cachedAt: string } | null> {
  const result = await pool.query(
    `SELECT data, cached_at FROM cached_sales_contracts WHERE cached_at > NOW() - INTERVAL '7 days' ORDER BY id DESC LIMIT 1`
  );
  return result.rows.length > 0 ? { data: result.rows[0].data, cachedAt: result.rows[0].cached_at } : null;
}

export async function cacheSalesContracts(data: unknown) {
  await pool.query(`DELETE FROM cached_sales_contracts`);
  await pool.query(
    `INSERT INTO cached_sales_contracts (data, cached_at) VALUES ($1, NOW())`,
    [JSON.stringify(data)]
  );
}

// ─── Units (Unidades de Empreendimentos) ─────────────────────────────────────

let unitsTableReady = false;
export async function ensureUnitsTable() {
  if (unitsTableReady) return;
  await pool.query(`CREATE TABLE IF NOT EXISTS cached_units (
    id SERIAL PRIMARY KEY, data JSONB NOT NULL, cached_at TIMESTAMP NOT NULL DEFAULT NOW()
  )`);
  unitsTableReady = true;
}

export async function getCachedUnits(): Promise<{ data: unknown; cachedAt: string } | null> {
  const result = await pool.query(
    `SELECT data, cached_at FROM cached_units WHERE cached_at > NOW() - INTERVAL '7 days' ORDER BY id DESC LIMIT 1`
  );
  return result.rows.length > 0 ? { data: result.rows[0].data, cachedAt: result.rows[0].cached_at } : null;
}

export async function cacheUnits(data: unknown) {
  await pool.query(`DELETE FROM cached_units`);
  await pool.query(
    `INSERT INTO cached_units (data, cached_at) VALUES ($1, NOW())`,
    [JSON.stringify(data)]
  );
}

// ─── Company Settings (M² e Fator) ──────────────────────────────────────────

export interface CompanySetting {
  companyId: number;
  companyName: string;
  areaM2: number;
  factor: number;
  status: string;
  controlaOrcamento: boolean;
  updatedAt: string;
}

export async function getCompanySettings(): Promise<CompanySetting[]> {
  const result = await pool.query(
    `SELECT company_id, company_name, area_m2, factor,
            COALESCE(status, 'ativa') as status,
            COALESCE(controla_orcamento, FALSE) as controla_orcamento,
            updated_at
     FROM company_settings ORDER BY company_name`
  );
  return result.rows.map((r: { company_id: number; company_name: string; area_m2: string; factor: string; status: string; controla_orcamento: boolean; updated_at: string }) => ({
    companyId: r.company_id,
    companyName: r.company_name,
    areaM2: parseFloat(r.area_m2),
    factor: parseFloat(r.factor),
    status: r.status,
    controlaOrcamento: !!r.controla_orcamento,
    updatedAt: r.updated_at,
  }));
}

export async function upsertCompanySetting(companyId: number, companyName: string, areaM2: number, factor: number, status: string, controlaOrcamento: boolean = false) {
  await pool.query(
    `INSERT INTO company_settings (company_id, company_name, area_m2, factor, status, controla_orcamento, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW())
     ON CONFLICT (company_id) DO UPDATE SET company_name = $2, area_m2 = $3, factor = $4, status = $5, controla_orcamento = $6, updated_at = NOW()`,
    [companyId, companyName, areaM2, factor, status, controlaOrcamento]
  );
}

export async function deleteCompanySetting(companyId: number) {
  await pool.query(`DELETE FROM company_settings WHERE company_id = $1`, [companyId]);
}

// ─── CUB SC Cache ───────────────────────────────────────────────────────────

export async function getCachedCub(): Promise<{ data: unknown; cachedAt: string } | null> {
  const result = await pool.query(
    `SELECT data, cached_at FROM cached_cub WHERE id = 1 AND cached_at > NOW() - INTERVAL '7 days'`
  );
  return result.rows.length > 0 ? { data: result.rows[0].data, cachedAt: result.rows[0].cached_at } : null;
}

export async function cacheCub(data: unknown) {
  await pool.query(
    `INSERT INTO cached_cub (id, data, cached_at) VALUES (1, $1, NOW())
     ON CONFLICT (id) DO UPDATE SET data = $1, cached_at = NOW()`,
    [JSON.stringify(data)]
  );
}

// ─── CUB Manual Override ────────────────────────────────────────────────────

export interface CubOverride {
  value: number;
  monthLabel: string;
  monthlyVariation: number;
  yearlyAccumulated: number;
  updatedAt: string;
}

export async function getCubOverride(): Promise<CubOverride | null> {
  const result = await pool.query(
    `SELECT value, month_label, monthly_variation, yearly_accumulated, updated_at FROM cub_override WHERE id = 1`
  );
  if (result.rows.length === 0) return null;
  const r = result.rows[0];
  return {
    value: parseFloat(r.value),
    monthLabel: r.month_label,
    monthlyVariation: parseFloat(r.monthly_variation),
    yearlyAccumulated: parseFloat(r.yearly_accumulated),
    updatedAt: r.updated_at,
  };
}

export async function upsertCubOverride(value: number, monthLabel: string, monthlyVariation: number, yearlyAccumulated: number) {
  await pool.query(
    `INSERT INTO cub_override (id, value, month_label, monthly_variation, yearly_accumulated, updated_at)
     VALUES (1, $1, $2, $3, $4, NOW())
     ON CONFLICT (id) DO UPDATE SET value = $1, month_label = $2, monthly_variation = $3, yearly_accumulated = $4, updated_at = NOW()`,
    [value, monthLabel, monthlyVariation, yearlyAccumulated]
  );
}

export async function deleteCubOverride() {
  await pool.query(`DELETE FROM cub_override WHERE id = 1`);
}

// ─── Exclusão de Títulos ────────────────────────────────────────────────────

export interface BillExclusion {
  companyId: number;
  billId: number;
  companyName: string;
  clientName: string;
  dueDate: string;
  originalAmount: number;
  observation: string;
  reason: string;
  createdAt: string;
}

export async function getBillExclusions(): Promise<BillExclusion[]> {
  const { rows } = await pool.query(
    `SELECT company_id AS "companyId", bill_id AS "billId", company_name AS "companyName",
            client_name AS "clientName", due_date AS "dueDate",
            original_amount AS "originalAmount", observation,
            reason, created_at AS "createdAt"
     FROM bill_exclusions ORDER BY company_name, bill_id`
  );
  return rows;
}

export async function addBillExclusion(
  companyId: number, billId: number, companyName: string,
  clientName: string, dueDate: string, originalAmount: number,
  observation: string, reason: string
) {
  await pool.query(
    `INSERT INTO bill_exclusions (company_id, bill_id, company_name, client_name, due_date, original_amount, observation, reason)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (company_id, bill_id) DO UPDATE SET
       company_name = $3, client_name = $4, due_date = $5, original_amount = $6,
       observation = $7, reason = $8, created_at = NOW()`,
    [companyId, billId, companyName, clientName, dueDate, originalAmount, observation, reason]
  );
}

export async function deleteBillExclusion(companyId: number, billId: number) {
  await pool.query(`DELETE FROM bill_exclusions WHERE company_id = $1 AND bill_id = $2`, [companyId, billId]);
}

// ─── DRE Mappings ─────────────────────────────────────────────────────────────

export interface DreMappingRow {
  dreCategory: string;
  financialPlanId: string;
  financialPlanName: string;
}

export async function getDreMappings(companyMode: string = "sp"): Promise<Record<string, DreMappingRow[]>> {
  const { rows } = await pool.query(
    `SELECT dre_category AS "dreCategory", financial_plan_id AS "financialPlanId",
            financial_plan_name AS "financialPlanName"
     FROM dre_mappings 
     WHERE company_mode = $1
     ORDER BY dre_category, financial_plan_name`,
    [companyMode]
  );
  const map: Record<string, DreMappingRow[]> = {};
  for (const row of rows) {
    if (!map[row.dreCategory]) map[row.dreCategory] = [];
    map[row.dreCategory].push(row);
  }
  return map;
}

export async function addDreMapping(dreCategory: string, financialPlanId: string, financialPlanName: string, companyMode: string = "sp") {
  await pool.query(
    `INSERT INTO dre_mappings (dre_category, financial_plan_id, financial_plan_name, company_mode)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (dre_category, financial_plan_id, company_mode) DO NOTHING`,
    [dreCategory, financialPlanId, financialPlanName, companyMode]
  );
}

export async function deleteDreMapping(dreCategory: string, financialPlanId: string, companyMode: string = "sp") {
  await pool.query(
    `DELETE FROM dre_mappings WHERE dre_category = $1 AND financial_plan_id = $2 AND company_mode = $3`,
    [dreCategory, financialPlanId, companyMode]
  );
}

// ─── DRE Excel Data (primary source, per company, per month) ─────────────────

export interface DreExcelAccount {
  financialPlanId: string;
  financialPlanName: string;
  dreCategory: string;
  amount: number;
  companyName: string;
  month: string;
}

export async function getDreExcelData(year: string, companyNames?: string[], months?: string[], excludeCompanies?: string[]): Promise<DreExcelAccount[]> {
  let query = `SELECT financial_plan_id AS "financialPlanId", financial_plan_name AS "financialPlanName",
                      dre_category AS "dreCategory", amount, company_name AS "companyName", month
               FROM dre_excel_supplementary WHERE year = $1`;
  const params: (string | string[])[] = [year];
  let paramIdx = 2;

  if (companyNames && companyNames.length > 0) {
    query += ` AND LOWER(company_name) = ANY($${paramIdx})`;
    params.push(companyNames.map(n => n.toLowerCase()));
    paramIdx++;
  }

  if (excludeCompanies && excludeCompanies.length > 0) {
    query += ` AND LOWER(company_name) != ALL($${paramIdx})`;
    params.push(excludeCompanies.map(n => n.toLowerCase()));
    paramIdx++;
  }

  if (months && months.length > 0) {
    query += ` AND month = ANY($${paramIdx})`;
    params.push(months);
    paramIdx++;
  }

  const { rows } = await pool.query(query, params);
  return rows.map(r => ({ ...r, amount: parseFloat(r.amount) }));
}

export async function saveDreExcelData(year: string, accounts: {
  companyId: string;
  companyName: string;
  financialPlanId: string;
  financialPlanName: string;
  dreCategory: string;
  amount: number;
  month: string;
}[]) {
  // Aggregate duplicates in memory (same year+month+company+account)
  const agg = new Map<string, { companyId: string; companyName: string; financialPlanId: string; financialPlanName: string; dreCategory: string; amount: number; month: string }>();
  for (const acc of accounts) {
    if (acc.amount === 0) continue;
    const key = `${acc.month}|${acc.companyId}|${acc.financialPlanId}`;
    const existing = agg.get(key);
    if (existing) {
      existing.amount += acc.amount;
    } else {
      agg.set(key, { ...acc });
    }
  }

  const companyIds = Array.from(new Set(accounts.map((a) => a.companyId)));
  if (companyIds.length > 0) {
    await pool.query(
      `DELETE FROM dre_excel_supplementary WHERE year = $1 AND company_id = ANY($2)`,
      [year, companyIds]
    );
  }
  for (const acc of agg.values()) {
    await pool.query(
      `INSERT INTO dre_excel_supplementary (year, month, company_id, company_name, financial_plan_id, financial_plan_name, dre_category, amount)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [year, acc.month, acc.companyId, acc.companyName, acc.financialPlanId, acc.financialPlanName, acc.dreCategory, acc.amount]
    );
  }
}

// ─── Confirmações de Chegada de Insumos ───────────────────────────────────────

export interface ArrivalConfirmation {
  id: number;
  purchaseOrderId: number;
  itemNumber: number;
  confirmedBy: string;
  quantity: number | null;
  notes: string;
  fileName: string;
  fileMimeType: string;
  createdAt: string;
}

export async function getArrivalConfirmations(orderId: number): Promise<ArrivalConfirmation[]> {
  const result = await pool.query(
    `SELECT id, purchase_order_id, item_number, confirmed_by, quantity, notes, file_name, file_mime_type, created_at
     FROM arrival_confirmations WHERE purchase_order_id = $1 ORDER BY created_at DESC`,
    [orderId]
  );
  return result.rows.map((r: {
    id: number; purchase_order_id: number; item_number: number;
    confirmed_by: string; quantity: number | null; notes: string; file_name: string; file_mime_type: string; created_at: string;
  }) => ({
    id: r.id,
    purchaseOrderId: r.purchase_order_id,
    itemNumber: r.item_number,
    confirmedBy: r.confirmed_by,
    quantity: r.quantity,
    notes: r.notes,
    fileName: r.file_name,
    fileMimeType: r.file_mime_type,
    createdAt: r.created_at,
  }));
}

export async function getBatchArrivalConfirmations(
  orderIds: number[]
): Promise<Record<number, ArrivalConfirmation[]>> {
  if (orderIds.length === 0) return {};
  const result = await pool.query(
    `SELECT id, purchase_order_id, item_number, confirmed_by, quantity,
            notes, file_name, file_mime_type, created_at
     FROM arrival_confirmations
     WHERE purchase_order_id = ANY($1::int[])
     ORDER BY purchase_order_id, created_at DESC`,
    [orderIds]
  );
  const map: Record<number, ArrivalConfirmation[]> = {};
  for (const r of result.rows as {
    id: number; purchase_order_id: number; item_number: number;
    confirmed_by: string; quantity: number | null; notes: string;
    file_name: string; file_mime_type: string; created_at: string;
  }[]) {
    const key = r.purchase_order_id;
    if (!map[key]) map[key] = [];
    map[key].push({
      id: r.id, purchaseOrderId: r.purchase_order_id,
      itemNumber: r.item_number, confirmedBy: r.confirmed_by,
      quantity: r.quantity, notes: r.notes, fileName: r.file_name,
      fileMimeType: r.file_mime_type, createdAt: r.created_at,
    });
  }
  return map;
}

export async function createArrivalConfirmation(data: {
  purchaseOrderId: number;
  itemNumber: number;
  confirmedBy: string;
  quantity: number | null;
  notes: string;
  fileName: string;
  fileMimeType: string;
  filePath: string;
}): Promise<number> {
  const result = await pool.query(
    `INSERT INTO arrival_confirmations
       (purchase_order_id, item_number, confirmed_by, quantity, notes, file_name, file_mime_type, file_path)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
    [data.purchaseOrderId, data.itemNumber, data.confirmedBy,
     data.quantity, data.notes, data.fileName, data.fileMimeType, data.filePath]
  );
  return result.rows[0].id as number;
}

export async function getArrivalConfirmationCounts(orderIds: number[]): Promise<Record<number, number>> {
  if (orderIds.length === 0) return {};
  const placeholders = orderIds.map((_, i) => `$${i + 1}`).join(",");
  const result = await pool.query(
    `SELECT purchase_order_id, COUNT(*)::int AS cnt FROM arrival_confirmations
     WHERE purchase_order_id IN (${placeholders}) GROUP BY purchase_order_id`,
    orderIds
  );
  const map: Record<number, number> = {};
  result.rows.forEach((row: { purchase_order_id: number; cnt: number }) => {
    map[row.purchase_order_id] = row.cnt;
  });
  return map;
}

export async function getArrivalConfirmationFilePath(id: number): Promise<{ filePath: string; fileMimeType: string; fileName: string } | null> {
  const result = await pool.query(
    `SELECT file_path, file_mime_type, file_name FROM arrival_confirmations WHERE id = $1`,
    [id]
  );
  if (!result.rows.length) return null;
  return {
    filePath: result.rows[0].file_path as string,
    fileMimeType: result.rows[0].file_mime_type as string,
    fileName: result.rows[0].file_name as string,
  };
}

// ─── Users ────────────────────────────────────────────────────────────────

export async function getUserByEmail(email: string): Promise<{ id: number; name: string; email: string; passwordHash: string; active: boolean } | null> {
  const result = await pool.query(
    `SELECT id, name, email, password_hash AS "passwordHash", active FROM users WHERE email = $1 AND active = TRUE`,
    [email]
  );
  return result.rows.length > 0 ? result.rows[0] : null;
}

export async function createUser(name: string, email: string, passwordHash: string) {
  await pool.query(
    `INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3)
     ON CONFLICT (email) DO UPDATE SET name = $1, password_hash = $2`,
    [name, email, passwordHash]
  );
}

// ─── Daily Bank Balances Cache ────────────────────────────────────────────

export async function getCachedDailyBalance(date: string): Promise<unknown[] | null> {
  const result = await pool.query(
    `SELECT data FROM cached_daily_balances WHERE balance_date = $1`,
    [date]
  );
  return result.rows.length > 0 ? result.rows[0].data : null;
}

export async function cacheDailyBalance(date: string, data: unknown[]) {
  await pool.query(
    `INSERT INTO cached_daily_balances (balance_date, data, cached_at) VALUES ($1, $2, NOW())
     ON CONFLICT (balance_date) DO UPDATE SET data = $2, cached_at = NOW()`,
    [date, JSON.stringify(data)]
  );
}

// ─── Indicadores de Mercado (CUB / CDI / IPCA / IGP-M) ────────────────────

export type CubIndicadorRow = {
  ano: number;
  mes: number;
  valor_m2: number;
  variacao_pct: number | null;
  variacao_acumulada_ano_pct: number | null;
  variacao_anual_pct: number | null;
  atualizado_em: string;
};

export type PctIndicadorRow = {
  ano: number;
  mes: number;
  variacao_pct: number;
  acumulado_12m_pct: number | null;
  atualizado_em: string;
};

export type DebitSlug = "cdi" | "ipca" | "igpm" | "incc";
const DEBIT_TABLE: Record<DebitSlug, string> = {
  cdi: "indices_cdi",
  ipca: "indices_ipca",
  igpm: "indices_igpm",
  incc: "indices_incc",
};

function toNum(v: unknown): number {
  return v === null || v === undefined ? 0 : Number(v);
}
function toNumOrNull(v: unknown): number | null {
  return v === null || v === undefined ? null : Number(v);
}

export async function getIndicadoresCub(): Promise<CubIndicadorRow[]> {
  const { rows } = await pool.query(
    `SELECT ano, mes, valor_m2, variacao_pct, variacao_acumulada_ano_pct,
            variacao_anual_pct, atualizado_em
       FROM indices_cub
       ORDER BY ano, mes`
  );
  return rows.map((r: Record<string, unknown>) => ({
    ano: Number(r.ano),
    mes: Number(r.mes),
    valor_m2: toNum(r.valor_m2),
    variacao_pct: toNumOrNull(r.variacao_pct),
    variacao_acumulada_ano_pct: toNumOrNull(r.variacao_acumulada_ano_pct),
    variacao_anual_pct: toNumOrNull(r.variacao_anual_pct),
    atualizado_em: r.atualizado_em instanceof Date
      ? r.atualizado_em.toISOString()
      : String(r.atualizado_em ?? ""),
  }));
}

export async function getIndicadoresDebit(slug: DebitSlug): Promise<PctIndicadorRow[]> {
  const table = DEBIT_TABLE[slug];
  const { rows } = await pool.query(
    `SELECT ano, mes, variacao_pct, acumulado_12m_pct, atualizado_em
       FROM ${table}
       ORDER BY ano, mes`
  );
  return rows.map((r: Record<string, unknown>) => ({
    ano: Number(r.ano),
    mes: Number(r.mes),
    variacao_pct: toNum(r.variacao_pct),
    acumulado_12m_pct: toNumOrNull(r.acumulado_12m_pct),
    atualizado_em: r.atualizado_em instanceof Date
      ? r.atualizado_em.toISOString()
      : String(r.atualizado_em ?? ""),
  }));
}

export async function upsertIndicadoresCub(
  rows: {
    ano: number;
    mes: number;
    valor_m2: number;
    variacao_pct: number;
    variacao_acumulada_ano_pct: number;
    variacao_anual_pct: number;
  }[]
): Promise<number> {
  if (rows.length === 0) return 0;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const r of rows) {
      await client.query(
        `INSERT INTO indices_cub
           (ano, mes, valor_m2, variacao_pct, variacao_acumulada_ano_pct, variacao_anual_pct, atualizado_em)
         VALUES ($1,$2,$3,$4,$5,$6,NOW())
         ON CONFLICT (ano, mes) DO UPDATE SET
           valor_m2 = EXCLUDED.valor_m2,
           variacao_pct = EXCLUDED.variacao_pct,
           variacao_acumulada_ano_pct = EXCLUDED.variacao_acumulada_ano_pct,
           variacao_anual_pct = EXCLUDED.variacao_anual_pct,
           atualizado_em = NOW()`,
        [r.ano, r.mes, r.valor_m2, r.variacao_pct, r.variacao_acumulada_ano_pct, r.variacao_anual_pct]
      );
    }
    await client.query("COMMIT");
    return rows.length;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export type ValorM2Row = {
  cidade: string;
  uf: string;
  posicao: number;
  valor_m2: number;
  variacao_12m_pct: number | null;
  referencia: string | null;
  atualizado_em: string;
};

export async function getIndicadoresValorM2(): Promise<ValorM2Row[]> {
  const { rows } = await pool.query(
    `SELECT cidade, uf, posicao, valor_m2, variacao_12m_pct, referencia, atualizado_em
       FROM indices_valor_m2
       ORDER BY posicao ASC, valor_m2 DESC`
  );
  return rows.map((r: Record<string, unknown>) => ({
    cidade: String(r.cidade ?? ""),
    uf: String(r.uf ?? ""),
    posicao: Number(r.posicao),
    valor_m2: toNum(r.valor_m2),
    variacao_12m_pct: toNumOrNull(r.variacao_12m_pct),
    referencia: r.referencia ? String(r.referencia) : null,
    atualizado_em: r.atualizado_em instanceof Date
      ? r.atualizado_em.toISOString()
      : String(r.atualizado_em ?? ""),
  }));
}

export async function upsertIndicadoresValorM2(
  rows: {
    cidade: string;
    uf: string;
    posicao: number;
    valor_m2: number;
    variacao_12m_pct: number | null;
    referencia: string | null;
  }[]
): Promise<number> {
  if (rows.length === 0) return 0;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Apaga o snapshot anterior — cada sync substitui o conjunto.
    await client.query(`DELETE FROM indices_valor_m2`);
    for (const r of rows) {
      await client.query(
        `INSERT INTO indices_valor_m2
           (cidade, uf, posicao, valor_m2, variacao_12m_pct, referencia, atualizado_em)
         VALUES ($1,$2,$3,$4,$5,$6,NOW())
         ON CONFLICT (cidade, uf) DO UPDATE SET
           posicao = EXCLUDED.posicao,
           valor_m2 = EXCLUDED.valor_m2,
           variacao_12m_pct = EXCLUDED.variacao_12m_pct,
           referencia = EXCLUDED.referencia,
           atualizado_em = NOW()`,
        [r.cidade, r.uf, r.posicao, r.valor_m2, r.variacao_12m_pct, r.referencia]
      );
    }
    await client.query("COMMIT");
    return rows.length;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function upsertIndicadoresDebit(
  slug: DebitSlug,
  rows: {
    ano: number;
    mes: number;
    variacao_pct: number;
    acumulado_12m_pct: number | null;
  }[]
): Promise<number> {
  if (rows.length === 0) return 0;
  const table = DEBIT_TABLE[slug];
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const r of rows) {
      await client.query(
        `INSERT INTO ${table}
           (ano, mes, variacao_pct, acumulado_12m_pct, atualizado_em)
         VALUES ($1,$2,$3,$4,NOW())
         ON CONFLICT (ano, mes) DO UPDATE SET
           variacao_pct = EXCLUDED.variacao_pct,
           acumulado_12m_pct = EXCLUDED.acumulado_12m_pct,
           atualizado_em = NOW()`,
        [r.ano, r.mes, r.variacao_pct, r.acumulado_12m_pct]
      );
    }
    await client.query("COMMIT");
    return rows.length;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export default pool;
