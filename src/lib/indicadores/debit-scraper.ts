export type IndicadorDebitSlug = "cdi" | "ipca" | "igpm";

export type IndicadorRow = {
  ano: number;
  mes: number;
  variacao_pct: number;
  acumulado_12m_pct: number | null;
};

function parseDate(s: string) {
  const m = s.trim().match(/^(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const mes = Number(m[1]);
  const ano = Number(m[2]);
  if (mes < 1 || mes > 12) return null;
  return { ano, mes };
}

function parsePct(s: string): number | null {
  const c = s.replace(/\s/g, "").replace("%", "").replace(",", ".");
  const neg = c.startsWith("-");
  const raw = c.replace("-", "");
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  return neg ? -n : n;
}

async function fetchFollowingRedirects(url: string, max = 5): Promise<string> {
  let current = url;
  for (let i = 0; i < max; i++) {
    const res = await fetch(current, {
      headers: { "User-Agent": "Mozilla/5.0 SYNC" },
      redirect: "manual",
      cache: "no-store",
    });
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      current = new URL(res.headers.get("location")!, current).toString();
      continue;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status} em ${current}`);
    return await res.text();
  }
  throw new Error("Muitos redirecionamentos");
}

export async function fetchDebitRows(slug: IndicadorDebitSlug): Promise<IndicadorRow[]> {
  const url = `https://debit.com.br/tabelas/tabela-completa.php?indice=${slug}`;
  const html = await fetchFollowingRedirects(url);

  const tbodyMatch = html.match(
    /Data[\s\S]*?Variação[\s\S]*?Acumulado 12 meses[\s\S]*?<tbody[^>]*>([\s\S]*?)<\/tbody>/i
  );
  if (!tbodyMatch) throw new Error(`Não foi possível localizar a tabela de ${slug} no HTML.`);
  const tbody = tbodyMatch[1];

  const trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  const tdRe = /<td[^>]*>([\s\S]*?)<\/td>/gi;

  const rows: IndicadorRow[] = [];
  for (const tr of Array.from(tbody.matchAll(trRe))) {
    const tds = Array.from(tr[1].matchAll(tdRe)).map((m) =>
      m[1].replace(/<[^>]+>/g, "").trim()
    );
    if (tds.length < 4) continue;

    const d = parseDate(tds[0]);
    const mensal = parsePct(tds[1]);
    const anual = parsePct(tds[3]);
    if (!d || mensal === null) continue;

    rows.push({
      ano: d.ano,
      mes: d.mes,
      variacao_pct: mensal,
      acumulado_12m_pct: anual,
    });
  }

  return rows;
}
