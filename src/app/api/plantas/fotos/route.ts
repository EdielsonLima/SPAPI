import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { listarFotosPlanta, inserirFotoPlanta } from "@/lib/db";

// Fotos da planta de um empreendimento (aba "Fotos" do "Ver planta" no Quadro
// Espelho 3D). Ficam no banco (plantas_fotos), gerenciadas na própria tela.
export const dynamic = "force-dynamic";

const MIMES = new Set(["image/jpeg", "image/png", "image/webp"]);
const TAMANHO_MAX = 8 * 1024 * 1024; // 8 MB por foto
const CHAVE_OK = /^[a-z0-9-]{1,60}$/;

const tituloDoArquivo = (nome: string) => {
  const base = nome.replace(/\.[a-z0-9]+$/i, "").replace(/^\d+[-_ ]*/, "").replace(/[-_]+/g, " ").trim();
  return base ? base.charAt(0).toUpperCase() + base.slice(1) : "Foto";
};

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const chave = new URL(request.url).searchParams.get("chave") || "";
  if (!CHAVE_OK.test(chave)) return NextResponse.json({ error: "chave inválida" }, { status: 400 });
  try {
    return NextResponse.json(await listarFotosPlanta(chave));
  } catch (e) {
    console.error("[plantas/fotos] listar", e);
    return NextResponse.json({ error: "Não consegui listar as fotos" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let form: FormData;
  try { form = await request.formData(); } catch { return NextResponse.json({ error: "Envio inválido" }, { status: 400 }); }
  const chave = String(form.get("chave") || "");
  if (!CHAVE_OK.test(chave)) return NextResponse.json({ error: "chave inválida" }, { status: 400 });
  const arquivos = form.getAll("fotos").filter((f): f is File => f instanceof File);
  if (!arquivos.length) return NextResponse.json({ error: "Nenhuma foto enviada" }, { status: 400 });
  if (arquivos.length > 20) return NextResponse.json({ error: "No máximo 20 fotos por envio" }, { status: 400 });
  const recusadas: string[] = [];
  const salvas = [];
  for (const f of arquivos) {
    if (!MIMES.has(f.type)) { recusadas.push(`${f.name}: só JPG, PNG ou WebP`); continue; }
    if (f.size > TAMANHO_MAX) { recusadas.push(`${f.name}: acima de 8 MB`); continue; }
    try {
      salvas.push(await inserirFotoPlanta(chave, tituloDoArquivo(f.name), f.type, Buffer.from(await f.arrayBuffer())));
    } catch (e) {
      console.error("[plantas/fotos] inserir", f.name, e);
      recusadas.push(`${f.name}: erro ao gravar`);
    }
  }
  return NextResponse.json({ salvas, recusadas });
}
