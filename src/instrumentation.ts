// Roda uma vez quando o servidor sobe (next start). Deixa pronto na memória o
// gzip do cache que o Painel Executivo lê ao abrir, para o primeiro acesso
// depois de um deploy/reinício não esperar ~30 s (Edielson, 09/11/2026).
// O import fica DENTRO do if (padrão do Next): assim o build do edge descarta o
// ramo e não tenta empacotar o `pg`.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.NEXT_PHASE !== "phase-production-build") {
    const { prepararCachePainel } = await import("@/lib/cache-sienge-resposta");
    // Espera o servidor terminar de subir; não segura o processo.
    const t = setTimeout(() => {
      prepararCachePainel("servidor iniciou").catch(() => {});
    }, 15_000);
    t.unref?.();
  }
}
