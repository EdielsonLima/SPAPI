import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { CONFIGS_COM_ENTORNO } from "@/lib/torre-3d";
import { erroDaEsri, tileNaArea, urlDoTile } from "@/lib/foto-aerea";

export const dynamic = "force-dynamic";

// Um quadradinho (tile) da foto aérea do 3D: busca no World Imagery da Esri com
// a chave do servidor (ARCGIS_API_KEY) e repassa. Só para quem está logado e só
// na região dos empreendimentos com mapa. Nada é guardado no servidor; o
// navegador guarda por um dia, o mesmo prazo que a Esri manda.
export async function GET(_req: NextRequest, { params }: { params: { z: string; y: string; x: string } }) {
  if (!(await getServerSession(authOptions))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const z = Number(params.z), y = Number(params.y), x = Number(params.x);
  if (!CONFIGS_COM_ENTORNO.some(c => c.local && tileNaArea(z, x, y, c.local.bbox))) {
    return NextResponse.json({ error: "Fora da região dos empreendimentos." }, { status: 400 });
  }
  const chave = (process.env.ARCGIS_API_KEY || "").trim();
  if (!chave) return NextResponse.json({ error: "Foto aérea sem chave no servidor (ARCGIS_API_KEY)." }, { status: 503 });
  try {
    const r = await fetch(urlDoTile(z, y, x, chave), { cache: "no-store", signal: AbortSignal.timeout(20_000) });
    const tipo = r.headers.get("content-type") || "";
    if (!r.ok || !tipo.startsWith("image/")) {
      const corpo = (await r.text().catch(() => "")).slice(0, 300);
      return NextResponse.json({ error: erroDaEsri(r.status, corpo) }, { status: 502 });
    }
    return new NextResponse(Buffer.from(await r.arrayBuffer()), { headers: { "Content-Type": tipo, "Cache-Control": "private, max-age=86400" } });
  } catch (e) {
    // A mensagem do erro pode trazer o endereço com a chave: fica só o tipo.
    return NextResponse.json({ error: `Sem resposta da Esri (${e instanceof Error ? e.name : "erro"}).` }, { status: 504 });
  }
}
