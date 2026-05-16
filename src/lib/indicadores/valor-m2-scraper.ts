const URL_VALOR_M2 = "https://myside.com.br/guia-imoveis/metro-quadrado-mais-caro-brasil";

export type ValorM2ScrapedRow = {
  cidade: string;
  uf: string;
  posicao: number;
  valor_m2: number;
  variacao_12m_pct: number | null;
  referencia: string | null;
};

function parseCidadeUf(s: string): { cidade: string; uf: string } | null {
  const m = s.trim().match(/^(.+?)\s*\(([A-Z]{2})\)\s*$/);
  if (!m) return null;
  return { cidade: m[1].trim(), uf: m[2] };
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

function extractReferencia(html: string): string | null {
  // Procura padrões como "dados referentes a abril de 2026" ou
  // "Informe de maio de 2026"
  const m1 = html.match(/dados\s+referentes\s+a\s+([a-zç]+\s+de\s+\d{4})/i);
  if (m1) return m1[1].toLowerCase();
  const m2 = html.match(/Informe\s+de\s+([a-zç]+\s+de\s+\d{4})/i);
  if (m2) return m2[1].toLowerCase();
  return null;
}

export async function fetchValorM2Rows(): Promise<{
  rows: ValorM2ScrapedRow[];
  referencia: string | null;
}> {
  const res = await fetch(URL_VALOR_M2, {
    headers: { "User-Agent": "Mozilla/5.0 SYNC" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Falha ao buscar Valor m²: HTML ${res.status}`);
  const html = await res.text();

  const referencia = extractReferencia(html);

  // Procura a tabela cujo cabeçalho contém "Cidade", "Valor do m²" e
  // "Variação 12 meses". Pega o primeiro <tbody> após essa assinatura.
  const tableMatch = html.match(
    /Cidade[\s\S]*?Valor\s+do\s+m²[\s\S]*?Variação\s+12\s+meses[\s\S]*?<tbody[^>]*>([\s\S]*?)<\/tbody>/i
  );
  if (!tableMatch) throw new Error("Não foi possível localizar a tabela de Valor m².");
  const tbody = tableMatch[1];

  const trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  const tdRe = /<td[^>]*>([\s\S]*?)<\/td>/gi;

  const rows: ValorM2ScrapedRow[] = [];
  let posicao = 0;
  for (const tr of Array.from(tbody.matchAll(trRe))) {
    const tds = Array.from(tr[1].matchAll(tdRe)).map((m) =>
      m[1].replace(/<[^>]+>/g, "").trim()
    );
    if (tds.length < 3) continue;

    const cu = parseCidadeUf(tds[0]);
    const valor = parsePrice(tds[1]);
    const variacao = parsePct(tds[2]);
    if (!cu || valor === null) continue;

    posicao += 1;
    rows.push({
      cidade: cu.cidade,
      uf: cu.uf,
      posicao,
      valor_m2: valor,
      variacao_12m_pct: variacao,
      referencia,
    });
  }

  return { rows, referencia };
}
