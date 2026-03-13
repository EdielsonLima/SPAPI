import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import pool from "@/lib/db";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await pool.query(`
    CREATE TABLE IF NOT EXISTS arrival_confirmations (
      id                 SERIAL PRIMARY KEY,
      purchase_order_id  INTEGER   NOT NULL,
      item_number        INTEGER   NOT NULL,
      confirmed_by       TEXT      NOT NULL,
      quantity           NUMERIC,
      notes              TEXT      NOT NULL,
      file_name          TEXT      NOT NULL,
      file_mime_type     TEXT      NOT NULL,
      file_path          TEXT      NOT NULL,
      created_at         TIMESTAMP NOT NULL DEFAULT NOW()
    );
    ALTER TABLE arrival_confirmations ADD COLUMN IF NOT EXISTS quantity NUMERIC;
    CREATE INDEX IF NOT EXISTS idx_arrival_confirmations_order
      ON arrival_confirmations (purchase_order_id);
  `);

  return NextResponse.json({ success: true, message: "Tabela arrival_confirmations criada/verificada." });
}
