import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { CONFIGS_COM_ENTORNO } from "@/lib/torre-3d";
import { CREDITO_FOTO, ZOOM_FOTO, erroDaEsri, tileDe, urlDoTile } from "@/lib/foto-aerea";

export const dynamic = "force-dynamic";

// Foto aérea do Quadro Espelho 3D (ver src/lib/foto-aerea.ts).
//  GET          → { disponivel, credito }: o botão só aparece com a chave no servidor.
//  GET ?diag=1  → pede um tile de teste à Esri e diz o que voltou. A chave nunca sai daqui.
export async function GET(req: NextRequest) {
  if (!(await getServerSession(authOptions))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const chave = (process.env.ARCGIS_API_KEY || "").trim();
  if (req.nextUrl.searchParams.get("diag") !== "1") {
    return NextResponse.json({ disponivel: !!chave, credito: CREDITO_FOTO, zoom: ZOOM_FOTO }, { headers: { "Cache-Control": "private, no-store" } });
  }
  const bbox = CONFIGS_COM_ENTORNO.find(c => c.local)?.local?.bbox;
  if (!chave || !bbox) return NextResponse.json({ chave: !!chave, teste: null });
  const [x, y] = tileDe((bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2, ZOOM_FOTO).map(Math.floor);
  const semResposta = (e: unknown) => `sem resposta da Esri (${e instanceof Error ? e.name : "erro"})`; // a mensagem pode trazer o endereço com a chave
  // O serviço de imagens devolveu tile até com token inventado (11/11/2026): quem
  // diz se a chave é boa é a consulta da conta, que responde 498 para token inválido.
  const conta = await fetch(`https://www.arcgis.com/sharing/rest/portals/self?f=json&token=${encodeURIComponent(chave)}`, { cache: "no-store", signal: AbortSignal.timeout(20_000) })
    .then(async r => { const corpo = (await r.text()).slice(0, 2000); const ok = r.ok && !corpo.includes('"error"'); return { ok, erro: ok ? null : erroDaEsri(r.status, corpo) }; })
    .catch(e => ({ ok: false, erro: semResposta(e) }));
  try {
    const r = await fetch(urlDoTile(ZOOM_FOTO, y, x, chave), { cache: "no-store", signal: AbortSignal.timeout(20_000) });
    const tipo = r.headers.get("content-type") || "";
    const imagem = r.ok && tipo.startsWith("image/");
    const corpo = imagem ? "" : (await r.text().catch(() => "")).slice(0, 300);
    return NextResponse.json({ chave: true, conta, teste: { ok: imagem, status: r.status, tipo, bytes: imagem ? (await r.arrayBuffer()).byteLength : 0, erro: imagem ? null : erroDaEsri(r.status, corpo) } });
  } catch (e) {
    return NextResponse.json({ chave: true, conta, teste: { ok: false, erro: semResposta(e) } });
  }
}
