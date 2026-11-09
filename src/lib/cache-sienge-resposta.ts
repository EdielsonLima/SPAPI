// Resposta das rotas /api/sienge/{outcome,income,bank-movements} quando há
// cache válido no PostgreSQL (Edielson, 09/11/2026: o Painel Executivo ficava
// carregando a cada clique; o Carlos Humberto não pode esperar nunca).
//  1. ?versao=<cachedAt> (Painel com o dado na memória da aba): igual →
//     { naoMudou: true }; diferente → { mudou: true } e o Painel pede a URL normal.
//     ?desde= é o mesmo pedido das abas abertas antes desta versão (mudou →
//     dado inteiro, como antes).
//  2. URL normal: ETag = cachedAt e "private, no-cache". O navegador guarda a
//     resposta no disco; numa aba nova ou depois de F5 ele pergunta com
//     If-None-Match e, sem mudança, o servidor responde 304 sem corpo.
//  3. O JSON sai do TEXTO do banco (data::text), sem parse/stringify no Node, e
//     em gzip — o Next não comprime as rotas de API aqui (CP 144 MB → 6,6 MB).
//     O gzip fica na memória por versão do cache e é preparado ANTES de alguém
//     pedir (prepararCachePainel): ao subir o servidor, depois da rotina diária
//     e depois do "Atualizar". Montá-lo na hora custava ~30 s na 1ª abertura.
import { gzip } from "zlib";
import { getCacheCachedAt, getCacheTextoDados, type QualCacheTexto } from "@/lib/db";
import {
  etagDoCache,
  jsonComCachedAt,
  navegadorTemVersao,
  respostaMudou,
  respostaNaoMudou,
} from "@/lib/cache-texto";
import { periodosDoPainel } from "@/lib/painel-periodos";

type Guardado = { cachedAt: string; gz: Uint8Array<ArrayBuffer> };

const MAX_GUARDADOS = 12;
// No globalThis: o Next empacota o instrumentation (que prepara ao subir) e as
// rotas (que servem) em pacotes separados, cada um com a sua cópia deste módulo.
// Sem isto o gzip preparado ao subir ficava numa cópia que as rotas não viam.
const memoria = globalThis as typeof globalThis & {
  __gzipCacheSienge?: {
    guardados: Map<string, Guardado>;
    emAndamento: Map<string, Promise<Guardado | null>>;
    fila: Promise<void>;
  };
};
const estado = (memoria.__gzipCacheSienge ??= { guardados: new Map(), emAndamento: new Map(), fila: Promise.resolve() });
const { guardados, emAndamento } = estado;

function comprimir(texto: string): Promise<Uint8Array<ArrayBuffer>> {
  // Uint8Array próprio (não o Buffer do Node), que é o que o Response aceita.
  return new Promise((ok, erro) =>
    gzip(Buffer.from(texto, "utf8"), { level: 6 }, (e, b) => (e ? erro(e) : ok(new Uint8Array(b))))
  );
}

/** gzip da versão `cachedAt` da chave: da memória, de um preparo em andamento ou lido agora. */
async function gzipDaVersao(qual: QualCacheTexto, inicio: string, fim: string, cachedAt: string): Promise<Guardado | null> {
  const chave = `${qual}|${inicio}|${fim}`;
  const guardado = guardados.get(chave);
  if (guardado && guardado.cachedAt === cachedAt) return guardado;
  const andando = emAndamento.get(chave);
  if (andando) {
    const r = await andando;
    if (r && r.cachedAt >= cachedAt) return r;
  }
  const preparo = (async (): Promise<Guardado | null> => {
    const dados = await getCacheTextoDados(qual, inicio, fim);
    if (!dados) return null;
    const novo = { cachedAt: dados.cachedAt, gz: await comprimir(jsonComCachedAt(dados.texto, dados.cachedAt)) };
    guardados.delete(chave);
    guardados.set(chave, novo);
    while (guardados.size > MAX_GUARDADOS) guardados.delete(guardados.keys().next().value as string);
    return novo;
  })().finally(() => emAndamento.delete(chave));
  emAndamento.set(chave, preparo);
  return preparo;
}

type Opcoes = { semGuardarNoNavegador?: boolean };

function cabecalhos(cachedAt: string, opcoes?: Opcoes): Record<string, string> {
  return opcoes?.semGuardarNoNavegador
    ? { "Cache-Control": "no-store" }
    : { ETag: etagDoCache(cachedAt), "Cache-Control": "private, no-cache", Vary: "Accept-Encoding" };
}

/**
 * null = sem cache válido: a rota segue para o Sienge, como antes.
 * `semGuardarNoNavegador`: resposta do "Atualizar" (URL com forceRefresh, que
 * não deve ocupar o disco do navegador).
 */
export async function responderDoCacheSienge(
  request: Request,
  qual: QualCacheTexto,
  startDate: string,
  endDate: string,
  opcoes?: Opcoes
): Promise<Response | null> {
  const cachedAt = await getCacheCachedAt(qual, startDate, endDate);
  if (!cachedAt) return null;
  const params = new URL(request.url).searchParams;
  const versao = params.get("versao");
  if (versao) return versao === cachedAt ? respostaNaoMudou(cachedAt) : respostaMudou(cachedAt);
  const desde = params.get("desde");
  if (desde && desde === cachedAt) return respostaNaoMudou(cachedAt);
  if (!opcoes?.semGuardarNoNavegador && navegadorTemVersao(request.headers.get("if-none-match"), cachedAt)) {
    return new Response(null, { status: 304, headers: cabecalhos(cachedAt) });
  }

  if (!/\bgzip\b/i.test(request.headers.get("accept-encoding") ?? "")) {
    const dados = await getCacheTextoDados(qual, startDate, endDate);
    if (!dados) return null;
    return new Response(jsonComCachedAt(dados.texto, dados.cachedAt), {
      headers: { "Content-Type": "application/json; charset=utf-8", ...cabecalhos(dados.cachedAt, opcoes) },
    });
  }
  const g = await gzipDaVersao(qual, startDate, endDate, cachedAt);
  if (!g) return null;
  return new Response(g.gz, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Encoding": "gzip",
      "Content-Length": String(g.gz.length),
      ...cabecalhos(g.cachedAt, opcoes),
    },
  });
}

/** As quatro chaves que o Painel Executivo lê ao abrir (ver fetchData). */
export function chavesDoPainel(ano?: number): { qual: QualCacheTexto; inicio: string; fim: string }[] {
  const p = periodosDoPainel(ano);
  return [
    { qual: "outcome", inicio: p.inicio, fim: p.fim },
    { qual: "income", inicio: p.inicio, fim: p.fimReceber },
    { qual: "bankMovements", inicio: p.inicio, fim: p.fim },
    { qual: "bankMovements", inicio: `all:${p.inicio}`, fim: `all:${p.fim}` },
  ];
}

/**
 * Deixa pronto na memória o gzip das chaves do Painel, uma de cada vez (pouca
 * memória de pico). Chave já pronta na versão atual é pulada. Pedidos seguidos
 * entram numa fila: o seguinte pega o que a rotina gravou depois do anterior.
 */
export function prepararCachePainel(motivo: string): Promise<void> {
  estado.fila = estado.fila.then(async () => {
    const t0 = Date.now();
    const feitas: string[] = [];
    for (const k of chavesDoPainel()) {
      try {
        const cachedAt = await getCacheCachedAt(k.qual, k.inicio, k.fim);
        if (!cachedAt) continue;
        const g = await gzipDaVersao(k.qual, k.inicio, k.fim, cachedAt);
        if (g) feitas.push(`${k.qual}${k.inicio.startsWith("all:") ? " (todos)" : ""} ${(g.gz.length / 1e6).toFixed(1)} MB`);
      } catch (e) {
        console.error(`[cache-painel] ${k.qual} ${k.inicio}..${k.fim} falhou:`, e instanceof Error ? e.message : e);
      }
    }
    console.log(`[cache-painel] pronto (${motivo}) em ${((Date.now() - t0) / 1000).toFixed(1)} s: ${feitas.join(", ") || "nada no cache"}`);
  });
  return estado.fila;
}
