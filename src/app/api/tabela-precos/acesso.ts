import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { podeEditarPrecos } from "@/lib/tabela-precos";

// Leitura: qualquer usuário logado. Escrita: só a lista de TABELA_PRECOS_EMAILS.
export async function sessaoOu401() {
  const session = await getServerSession(authOptions);
  if (!session) return { erro: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const email = session.user?.email || "";
  return { email, nome: session.user?.name || email, podeEditar: podeEditarPrecos(email) };
}

export async function editorOu403() {
  const s = await sessaoOu401();
  if ("erro" in s) return s;
  if (!s.podeEditar) {
    return { erro: NextResponse.json({ error: "Seu usuário não tem permissão para alterar a tabela de preços." }, { status: 403 }) };
  }
  return s;
}

export const novoLote = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export const valorValido = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v) && v > 0 && v < 1e11;
