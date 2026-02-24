import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

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

export default pool;
