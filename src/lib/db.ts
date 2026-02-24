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

export default pool;
