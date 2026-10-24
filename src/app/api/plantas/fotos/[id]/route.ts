import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { obterFotoPlanta, apagarFotoPlanta, atualizarFotoPlanta, moverFotoPlanta } from "@/lib/db";

export const dynamic = "force-dynamic";

const idDe = (params: { id: string }) => { const id = Number(params.id); return Number.isInteger(id) && id > 0 ? id : null; };

// A imagem em si. O <img> da tela manda o cookie da sessão, então exige login
// como o resto; cache privado de um dia (a URL leva o id, que nunca muda).
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = idDe(params);
  if (!id) return NextResponse.json({ error: "id inválido" }, { status: 400 });
  const foto = await obterFotoPlanta(id);
  if (!foto) return NextResponse.json({ error: "Foto não encontrada" }, { status: 404 });
  return new NextResponse(new Uint8Array(foto.dados), { headers: { "Content-Type": foto.mime, "Cache-Control": "private, max-age=86400", "Content-Length": String(foto.dados.length) } });
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = idDe(params);
  if (!id) return NextResponse.json({ error: "id inválido" }, { status: 400 });
  let corpo: { titulo?: unknown; mover?: unknown };
  try { corpo = await request.json(); } catch { return NextResponse.json({ error: "JSON inválido" }, { status: 400 }); }
  try {
    if (corpo.mover === "antes" || corpo.mover === "depois") await moverFotoPlanta(id, corpo.mover === "antes" ? -1 : 1);
    if (typeof corpo.titulo === "string") await atualizarFotoPlanta(id, { titulo: corpo.titulo.trim().slice(0, 120) });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[plantas/fotos] atualizar", id, e);
    return NextResponse.json({ error: "Não consegui atualizar a foto" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = idDe(params);
  if (!id) return NextResponse.json({ error: "id inválido" }, { status: 400 });
  try {
    const apagou = await apagarFotoPlanta(id);
    return apagou ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Foto não encontrada" }, { status: 404 });
  } catch (e) {
    console.error("[plantas/fotos] apagar", id, e);
    return NextResponse.json({ error: "Não consegui apagar a foto" }, { status: 500 });
  }
}
