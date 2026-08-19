import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  getConferencia,
  saveConferencia,
  deleteConferencia,
  type ConferenciaStatus,
} from "@/lib/db";

const STATUS_VALIDOS = new Set(["real", "pago", "corrigir", "excluir"]);

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return NextResponse.json({ data: await getConferencia() });
  } catch (error) {
    console.error("Error fetching conferencia:", error);
    return NextResponse.json({ error: "Failed to fetch conferencia" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const b = await request.json();
    if (b.tipo !== "cp" && b.tipo !== "cr") {
      return NextResponse.json({ error: "tipo deve ser cp ou cr" }, { status: 400 });
    }
    if (!STATUS_VALIDOS.has(b.status)) {
      return NextResponse.json({ error: "status invalido" }, { status: 400 });
    }
    if (!b.companyId || !b.billId || b.installmentId === undefined) {
      return NextResponse.json(
        { error: "companyId, billId e installmentId sao obrigatorios" },
        { status: 400 }
      );
    }
    await saveConferencia({
      tipo: b.tipo,
      companyId: Number(b.companyId),
      billId: Number(b.billId),
      installmentId: Number(b.installmentId),
      status: b.status as ConferenciaStatus,
      observacao: b.observacao || "",
      companyName: b.companyName || "",
      contraparte: b.contraparte || "",
      dueDate: b.dueDate || "",
      valor: Number(b.valor) || 0,
      // quem decidiu fica registrado junto — a decisao precisa ter dono
      atualizadoPor: session.user?.name || session.user?.email || "",
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error saving conferencia:", error);
    return NextResponse.json({ error: "Failed to save conferencia" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const s = new URL(request.url).searchParams;
    const [tipo, companyId, billId, installmentId] = [
      s.get("tipo"), s.get("companyId"), s.get("billId"), s.get("installmentId"),
    ];
    if (!tipo || !companyId || !billId || installmentId === null) {
      return NextResponse.json({ error: "parametros obrigatorios ausentes" }, { status: 400 });
    }
    await deleteConferencia(tipo, Number(companyId), Number(billId), Number(installmentId));
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting conferencia:", error);
    return NextResponse.json({ error: "Failed to delete conferencia" }, { status: 500 });
  }
}
