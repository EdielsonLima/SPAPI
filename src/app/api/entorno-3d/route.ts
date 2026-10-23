import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { lerEntorno, gravarEntorno } from "@/lib/db";
import { CONFIGS_COM_ENTORNO } from "@/lib/torre-3d";
import { consultaLocalizar, consultaEntorno, localizarLote, processarEntorno, RAIO_PREDIOS, RAIO_LONGE, VERSAO_ENTORNO, type ElementoOSM, type DadosEntorno } from "@/lib/entorno-osm";

// Entorno da maquete 3D (ruas com nome, quadras, praia e mar).
//  GET ?chave=palacio-elizabeth → dados do banco; na 1ª vez baixa do
//  OpenStreetMap (Overpass), processa e guarda. ?refazer=1 baixa de novo.

const OVERPASS = ["https://overpass-api.de/api/interpreter", "https://overpass.private.coffee/api/interpreter", "https://overpass.kumi.systems/api/interpreter", "https://maps.mail.ru/osm/tools/overpass/api/interpreter"];

async function overpass(q: string, falhas: string[]): Promise<ElementoOSM[]> {
  let ultimo: unknown;
  for (const url of OVERPASS) {
    try {
      const r = await fetch(url, {
        method: "POST", body: new URLSearchParams({ data: q }),
        headers: { "User-Agent": "DTConsultorias-Torre3D/1.0 (edielson@dtconsultorias.com)" },
        signal: AbortSignal.timeout(200_000), cache: "no-store",
      });
      if (!r.ok) throw new Error(`HTTP ${r.status} ${(await r.text().catch(() => "")).slice(0, 200)}`);
      return ((await r.json()) as { elements: ElementoOSM[] }).elements;
    } catch (e) { ultimo = e; falhas.push(`${new URL(url).host}: ${e instanceof Error ? e.message : e}`); console.warn("[entorno-3d] overpass falhou", url, e); }
  }
  throw ultimo;
}

const gerando = new Map<string, Promise<unknown>>(); // duas telas abertas não baixam duas vezes
let ultimaFalha: { quando: string; etapa: string; erro: string; tentativas: string[] } | null = null;

export async function GET(req: NextRequest) {
  if (!(await getServerSession(authOptions))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const chave = req.nextUrl.searchParams.get("chave") || "";
  const local = CONFIGS_COM_ENTORNO.find(c => c.local?.chave === chave)?.local;
  if (!local) return NextResponse.json({ error: "Empreendimento sem entorno." }, { status: 404 });
  const refazer = req.nextUrl.searchParams.get("refazer") === "1";
  // ?diag=1: o que deu errado na última tentativa (o mapa falha calado na tela).
  if (req.nextUrl.searchParams.get("diag") === "1") {
    const salvo = await lerEntorno(chave).catch(() => null) as { ruas?: unknown[]; predios?: unknown[]; lote?: unknown } | null;
    return NextResponse.json({ noBanco: !!salvo, ruas: salvo?.ruas?.length ?? 0, predios: salvo?.predios?.length ?? 0, lote: salvo?.lote ?? null, gerando: gerando.has(chave), ultimaFalha });
  }
  try {
    const salvo = refazer ? null : await lerEntorno(chave) as DadosEntorno | null;
    if (salvo && salvo.versao === VERSAO_ENTORNO) return NextResponse.json(salvo, { headers: { "Cache-Control": "private, max-age=86400" } });
    // Depois de uma falha, espera 2 min antes de tentar de novo (a tela pergunta a cada 20 s).
    const falhouHaPouco = !!ultimaFalha && Date.now() - Date.parse(ultimaFalha.quando) < 120_000;
    if (!gerando.has(chave) && !(salvo && falhouHaPouco)) {
      gerando.set(chave, (async () => {
        const falhas: string[] = [];
        let etapa = "localizar a rua";
        try {
          const els = await overpass(consultaLocalizar(local), falhas);
          const lote = localizarLote(els, local);
          if (!lote) {
            const nomes = Array.from(new Set(els.map(e => e.tags?.name).filter(Boolean))).slice(0, 10).join(", ");
            throw new Error(`Rua ${local.rua} não encontrada no OpenStreetMap (${els.length} elementos; nomes: ${nomes || "nenhum"})`);
          }
          etapa = "baixar o entorno";
          const dados = processarEntorno(await overpass(consultaEntorno(lote.lat, lote.lon, local.raio ?? RAIO_PREDIOS, local.raioLonge ?? RAIO_LONGE), falhas), lote, local);
          if (!dados.ruas.length) throw new Error("Overpass devolveu o entorno sem nenhuma rua");
          etapa = "gravar no banco";
          await gravarEntorno(chave, dados);
          ultimaFalha = null;
          return dados;
        } catch (e) {
          ultimaFalha = { quando: new Date().toISOString(), etapa, erro: e instanceof Error ? e.message : String(e), tentativas: falhas };
          throw e;
        }
      })().finally(() => gerando.delete(chave)));
      gerando.get(chave)!.catch(() => {}); // refazendo em segundo plano: a falha fica no diag
    }
    // Versão antiga no banco: mostra ela agora; a nova fica pronta para a próxima abertura.
    if (salvo) return NextResponse.json(salvo, { headers: { "Cache-Control": "no-store" } });
    return NextResponse.json(await gerando.get(chave)!);
  } catch (e) {
    console.error("[entorno-3d]", e);
    return NextResponse.json({ error: "Mapa do entorno indisponível agora." }, { status: 503 });
  }
}
