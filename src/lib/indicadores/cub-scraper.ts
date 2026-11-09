// Série histórica: myside (tabela mês a mês desde 2013).
// Mês mais recente: página oficial do Sinduscon da Grande Florianópolis, que
// publica o CUB/SC no começo do mês, dias antes de o myside atualizar
// (Edielson, 09/11/2026: o painel ficou em Out/26 com o de novembro já no ar).
const URL_CUB = "https://myside.com.br/guia-balneario-camboriu/cub-sc";
export const URL_CUB_SINDUSCON = "https://sinduscon-fpolis.org.br/servico/cub-mensal/";

const MESES_MAP: Record<string, number> = {
  jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6,
  jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12,
};

export type CubRow = {
  ano: number;
  mes: number;
  valor_m2: number;
  variacao_pct: number;
  variacao_acumulada_ano_pct: number;
  variacao_anual_pct: number;
  /** De onde veio a linha (só informativo; não vai para o banco). */
  fonte?: "myside" | "sinduscon";
};

function parseMesAno(label: string) {
  const m = label.trim().toLowerCase().match(/^([a-z]{3})\/(\d{2,4})$/);
  if (!m) return null;
  const mes = MESES_MAP[m[1]];
  if (!mes) return null;
  let ano = Number(m[2]);
  if (ano < 100) ano = 2000 + ano;
  return { ano, mes };
}

function parsePrice(s: string): number | null {
  const n = s.replace(/[^\d,\-]/g, "").replace(/\./g, "").replace(",", ".");
  const v = Number(n);
  return Number.isFinite(v) ? v : null;
}

function parsePct(s: string): number | null {
  const c = s.replace(/\s/g, "").replace("%", "");
  const neg = c.startsWith("-");
  const raw = c.replace("-", "").replace(",", ".");
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  return neg ? -n : n;
}

async function fetchCubRowsMyside(): Promise<CubRow[]> {
  const res = await fetch(URL_CUB, {
    headers: { "User-Agent": "Mozilla/5.0 SYNC" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Falha ao buscar CUB-SC: HTTP ${res.status}`);
  const html = await res.text();

  const tbodyMatch = html.match(/Mês\/Ano[\s\S]*?<tbody[^>]*>([\s\S]*?)<\/tbody>/i);
  if (!tbodyMatch) throw new Error("Não foi possível localizar o tbody da tabela CUB-SC.");
  const tbody = tbodyMatch[1];

  const trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  const tdRe = /<td[^>]*>([\s\S]*?)<\/td>/gi;

  const rows: CubRow[] = [];
  for (const tr of Array.from(tbody.matchAll(trRe))) {
    const tds = Array.from(tr[1].matchAll(tdRe)).map((m) =>
      m[1].replace(/<[^>]+>/g, "").trim()
    );
    if (tds.length < 5) continue;

    const mesAno = parseMesAno(tds[0]);
    const valor = parsePrice(tds[1]);
    const mensal = parsePct(tds[2]);
    const acAno = parsePct(tds[3]);
    const anual = parsePct(tds[4]);

    if (
      !mesAno ||
      valor === null ||
      mensal === null ||
      acAno === null ||
      anual === null
    ) {
      continue;
    }

    rows.push({
      ano: mesAno.ano,
      mes: mesAno.mes,
      valor_m2: valor,
      variacao_pct: mensal,
      variacao_acumulada_ano_pct: acAno,
      variacao_anual_pct: anual,
      fonte: "myside",
    });
  }

  return rows;
}

// ─── Sinduscon-SC (mês mais recente) ─────────────────────────────────────────

const MESES_EXTENSO: Record<string, number> = {
  janeiro: 1, fevereiro: 2, marco: 3, abril: 4, maio: 5, junho: 6,
  julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12,
};

export type CubSinduscon = {
  /** Mês "Para ser usado em" — é o rótulo que o myside e o mercado usam
   * ("CUB de novembro" = mês de referência outubro, para usar em novembro). */
  ano: number;
  mes: number;
  valor_m2: number;
  variacao_pct: number;
};

function semAcento(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/**
 * Lê o bloco "Residencial Médio" da página CUB Mensal do Sinduscon:
 * "Mês de Referência: Outubro/2026 · Para ser usado em: Novembro/2026 ·
 * R$3.182,95 · 0,35%". O Residencial Médio é o mesmo número da série do
 * myside (conferido: Out/26 3.171,96 → Nov/26 3.182,95 = +0,35%).
 */
export function lerCubSinduscon(html: string): CubSinduscon | null {
  const texto = semAcento(
    html
      .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
  ).replace(/\s+/g, " ");
  const m = texto.match(
    /Residencial Medio\s*Mes de Referencia:\s*[A-Za-z]+\/\d{4}\s*Para ser usado em:\s*([A-Za-z]+)\/(\d{4})\s*R\$\s*([\d.]+,\d{2})\s*(-?\d+(?:,\d+)?)\s*%/i
  );
  if (!m) return null;
  const mes = MESES_EXTENSO[m[1].toLowerCase()];
  const ano = Number(m[2]);
  const valor = Number(m[3].replace(/\./g, "").replace(",", "."));
  const pct = Number(m[4].replace(",", "."));
  if (!mes || !Number.isFinite(ano) || !Number.isFinite(valor) || valor <= 100 || !Number.isFinite(pct)) {
    return null;
  }
  return { ano, mes, valor_m2: valor, variacao_pct: pct };
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Acrescenta à série do myside o mês do Sinduscon quando ele é mais novo.
 * Acumulado no ano = valor ÷ dezembro do ano anterior − 1; 12 meses = valor ÷
 * mesmo mês do ano anterior − 1 (as mesmas contas do myside). Sem as bases na
 * série, ou mês igual/mais velho, a série volta como veio.
 */
export function completarComSinduscon(rows: CubRow[], sind: CubSinduscon | null): CubRow[] {
  if (!sind) return rows;
  const chave = (a: number, m: number) => a * 100 + m;
  const ultimo = rows.reduce((mx, r) => Math.max(mx, chave(r.ano, r.mes)), 0);
  if (chave(sind.ano, sind.mes) <= ultimo) return rows;
  const valorDe = (a: number, m: number) => rows.find((r) => r.ano === a && r.mes === m)?.valor_m2;
  const dezAnterior = valorDe(sind.ano - 1, 12);
  const anoAnterior = valorDe(sind.ano - 1, sind.mes);
  if (!dezAnterior || !anoAnterior) return rows;
  return [
    ...rows,
    {
      ano: sind.ano,
      mes: sind.mes,
      valor_m2: sind.valor_m2,
      variacao_pct: sind.variacao_pct,
      variacao_acumulada_ano_pct: r2((sind.valor_m2 / dezAnterior - 1) * 100),
      variacao_anual_pct: r2((sind.valor_m2 / anoAnterior - 1) * 100),
      fonte: "sinduscon",
    },
  ];
}

async function fetchCubSinduscon(): Promise<CubSinduscon | null> {
  try {
    const res = await fetch(URL_CUB_SINDUSCON, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
      cache: "no-store",
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) return null;
    return lerCubSinduscon(await res.text());
  } catch (err) {
    console.error("CUB Sinduscon-SC indisponível:", err);
    return null;
  }
}

/** Série do myside + mês novo do Sinduscon (se já saiu e o myside ainda não tem). */
export async function fetchCubRows(): Promise<CubRow[]> {
  const [rows, sind] = await Promise.all([fetchCubRowsMyside(), fetchCubSinduscon()]);
  return completarComSinduscon(rows, sind);
}
