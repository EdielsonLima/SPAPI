// Resposta das rotas /api/sienge/{outcome,income,bank-movements} quando há
// cache válido no PostgreSQL (Edielson, 09/11/2026: o Painel Executivo ficava
// carregando a cada clique). Três coisas, nesta ordem:
//  1. ?desde=<cachedAt> igual ao gravado → { naoMudou: true } (o Painel já tem);
//  2. o JSON sai do TEXTO do banco (data::text), sem parse/stringify no Node;
//  3. comprimido em gzip — o Next não comprime as rotas de API aqui e os 144 MB
//     de Contas a Pagar iam crus pela rede (gzip nível 6: 6,6 MB). O gzip fica
//     guardado na memória do servidor por versão do cache: só comprime de novo
//     quando o cache muda.
import { gzip } from "zlib";
import { getCacheCachedAt, getCacheTextoDados, type QualCacheTexto } from "@/lib/db";
import { jsonComCachedAt, respostaNaoMudou } from "@/lib/cache-texto";

const MAX_GUARDADOS = 12;
const guardados = new Map<string, { cachedAt: string; gz: Uint8Array<ArrayBuffer> }>();

function comprimir(texto: string): Promise<Uint8Array<ArrayBuffer>> {
  // Uint8Array próprio (não o Buffer do Node), que é o que o Response aceita.
  return new Promise((ok, erro) =>
    gzip(Buffer.from(texto, "utf8"), { level: 6 }, (e, b) => (e ? erro(e) : ok(new Uint8Array(b))))
  );
}

function respostaGzip(gz: Uint8Array<ArrayBuffer>): Response {
  return new Response(gz, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Encoding": "gzip",
      "Content-Length": String(gz.length),
      Vary: "Accept-Encoding",
    },
  });
}

/** null = sem cache válido: a rota segue para o Sienge, como antes. */
export async function responderDoCacheSienge(
  request: Request,
  qual: QualCacheTexto,
  startDate: string,
  endDate: string
): Promise<Response | null> {
  const cachedAt = await getCacheCachedAt(qual, startDate, endDate);
  if (!cachedAt) return null;
  const desde = new URL(request.url).searchParams.get("desde");
  if (desde && desde === cachedAt) return respostaNaoMudou(cachedAt);

  const aceitaGzip = /\bgzip\b/i.test(request.headers.get("accept-encoding") ?? "");
  const chave = `${qual}|${startDate}|${endDate}`;
  const guardado = guardados.get(chave);
  if (aceitaGzip && guardado && guardado.cachedAt === cachedAt) return respostaGzip(guardado.gz);

  const dados = await getCacheTextoDados(qual, startDate, endDate);
  if (!dados) return null;
  const json = jsonComCachedAt(dados.texto, dados.cachedAt);
  if (!aceitaGzip) {
    return new Response(json, { headers: { "Content-Type": "application/json; charset=utf-8" } });
  }
  const gz = await comprimir(json);
  guardados.delete(chave);
  guardados.set(chave, { cachedAt: dados.cachedAt, gz });
  while (guardados.size > MAX_GUARDADOS) guardados.delete(guardados.keys().next().value as string);
  return respostaGzip(gz);
}
