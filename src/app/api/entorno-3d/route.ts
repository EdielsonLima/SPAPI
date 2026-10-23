import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { lerEntorno, gravarEntorno } from "@/lib/db";
import { CONFIGS_COM_ENTORNO } from "@/lib/torre-3d";
import { consultaLocalizar, consultaEntorno, localizarLote, processarEntorno, type ElementoOSM } from "@/lib/entorno-osm";

// Entorno da maquete 3D (ruas com nome, quadras, praia e mar).
//  GET ?chave=palacio-elizabeth → dados do banco; na 1ª vez baixa do
//  OpenStreetMap (Overpass), processa e guarda. ?refazer=1 baixa de novo.

const OVERPASS = ["https://overpass-api.de/api/interpreter", "https://overpass.private.coffee/api/interpreter", "https://overpass.kumi.systems/api/interpreter"];

async function overpass(q: string): Promise<ElementoOSM[]> {
  let ultimo: unknown;
  for (const url of OVERPASS) {
    try {
      const r = await fetch(url, {
        method: "POST", body: new URLSearchParams({ data: q }),
        headers: { "User-Agent": "DTConsultorias-Torre3D/1.0 (edielson@dtconsultorias.com)" },
        signal: AbortSignal.timeout(150_000), cache: "no-store",
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return ((await r.json()) as { elements: ElementoOSM[] }).elements;
    } catch (e) { ultimo = e; console.warn("[entorno-3d] overpass falhou", url, e); }
  }
  throw ultimo;
}

const gerando = new Map<string, Promise<unknown>>(); // duas telas abertas não baixam duas vezes

export async function GET(req: NextRequest) {
  if (!(await getServerSession(authOptions))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const chave = req.nextUrl.searchParams.get("chave") || "";
  const local = CONFIGS_COM_ENTORNO.find(c => c.local?.chave === chave)?.local;
  if (!local) return NextResponse.json({ error: "Empreendimento sem entorno." }, { status: 404 });
  const refazer = req.nextUrl.searchParams.get("refazer") === "1";
  try {
    if (!refazer) {
      const salvo = await lerEntorno(chave);
      if (salvo) return NextResponse.json(salvo, { headers: { "Cache-Control": "private, max-age=86400" } });
    }
    if (!gerando.has(chave)) {
      gerando.set(chave, (async () => {
        const lote = localizarLote(await overpass(consultaLocalizar(local)), local);
        if (!lote) throw new Error(`Rua ${local.rua} não encontrada no OpenStreetMap`);
        const dados = processarEntorno(await overpass(consultaEntorno(lote.lat, lote.lon, local.raio ?? 700)), lote, local);
        await gravarEntorno(chave, dados);
        return dados;
      })().finally(() => gerando.delete(chave)));
    }
    return NextResponse.json(await gerando.get(chave));
  } catch (e) {
    console.error("[entorno-3d]", e);
    return NextResponse.json({ error: "Mapa do entorno indisponível agora." }, { status: 503 });
  }
}
