import { NextRequest, NextResponse } from "next/server";
import { listarHistoricoPrecos } from "@/lib/db";
import { sessaoOu401 } from "../acesso";

// Histórico de alterações da tabela de preços. ?unitId= filtra uma unidade.
export async function GET(request: NextRequest) {
  const s = await sessaoOu401();
  if ("erro" in s) return s.erro;
  const unitId = parseInt(request.nextUrl.searchParams.get("unitId") || "", 10);
  try {
    const historico = await listarHistoricoPrecos({ unitId: unitId > 0 ? unitId : undefined });
    return NextResponse.json({ historico });
  } catch (e) {
    console.error("[tabela-precos] historico", e);
    return NextResponse.json({ error: "Falha ao ler o histórico." }, { status: 500 });
  }
}
