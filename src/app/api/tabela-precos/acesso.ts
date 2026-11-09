import { NextResponse } from "next/server";
import { getServerSession, type Session } from "next-auth";
import { authOptions } from "@/lib/auth";
import { podeEditarPrecos } from "@/lib/tabela-precos";

// Administrador (Edielson, 09/11/2026: "todos os usuários admin tenham que poder
// mudar ali os valores e editar"): quem entra pelo login "Administrador" ou
// chega do Portal com `role: "admin"` no bilhete (src/lib/auth.ts).
export const ehAdministrador = (session: Session | null | undefined): boolean =>
  (session?.user as { admin?: boolean } | undefined)?.admin === true;

// Quem altera preço, situação, tabela comercial e andamento da obra:
// administradores e a lista de TABELA_PRECOS_EMAILS.
export const podeEditarNaSessao = (session: Session | null | undefined): boolean =>
  ehAdministrador(session) || podeEditarPrecos(session?.user?.email);

// Leitura: qualquer usuário logado. Escrita: administradores e a lista de TABELA_PRECOS_EMAILS.
export async function sessaoOu401() {
  const session = await getServerSession(authOptions);
  if (!session) return { erro: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const email = session.user?.email || "";
  return { email, nome: session.user?.name || email, podeEditar: podeEditarNaSessao(session) };
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
