// Resposta das rotas /api/sienge/{outcome,income,bank-movements} montada com o
// TEXTO do cache (data::text do PostgreSQL), sem JSON.parse + JSON.stringify no
// Node. O Painel Executivo baixa ~350 MB desses caches a cada abertura e
// desmontar/remontar o JSON custava segundos e muita memória no servidor
// (Edielson, 09/11/2026: "toda vez que clica no painel executivo, ele fica
// carregando"). Função pura; trava: src/__tests__/cache-texto.test.ts

/**
 * Mesmo resultado de `{ ...dados, cachedAt }` (objeto) ou `{ data: dados,
 * cachedAt }` (qualquer outra coisa), feito por texto. Num JSON com chave
 * repetida vale a última — igual ao spread, que sobrescreve um cachedAt antigo.
 */
export function jsonComCachedAt(texto: string, cachedAt: string): string {
  const t = texto.trim();
  const carimbo = `"cachedAt":${JSON.stringify(cachedAt)}`;
  if (t.startsWith("{") && t.endsWith("}")) {
    const vazio = t.slice(1, -1).trim() === "";
    return vazio ? `{${carimbo}}` : `${t.slice(0, -1)},${carimbo}}`;
  }
  return `{"data":${t || "null"},${carimbo}}`;
}

const SEM_GUARDAR = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" };

/** Resposta curta quando o Painel já tem essa versão do cache (?versao= / ?desde=). */
export function respostaNaoMudou(cachedAt: string): Response {
  return new Response(JSON.stringify({ naoMudou: true, cachedAt }), { headers: SEM_GUARDAR });
}

/** ?versao= de outra versão: o Painel pede então a URL normal (a que o navegador guarda). */
export function respostaMudou(cachedAt: string): Response {
  return new Response(JSON.stringify({ naoMudou: false, mudou: true, cachedAt }), { headers: SEM_GUARDAR });
}

/** ETag da versão do cache. O If-None-Match pode vir fraco (W/) ou com várias. */
export function etagDoCache(cachedAt: string): string {
  return `"${cachedAt}"`;
}
export function navegadorTemVersao(ifNoneMatch: string | null, cachedAt: string): boolean {
  if (!ifNoneMatch) return false;
  const etag = etagDoCache(cachedAt);
  return ifNoneMatch.split(",").some((v) => v.trim().replace(/^W\//, "") === etag);
}
