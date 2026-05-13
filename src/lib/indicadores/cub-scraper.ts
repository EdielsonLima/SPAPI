const URL_CUB = "https://myside.com.br/guia-balneario-camboriu/cub-sc";

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

export async function fetchCubRows(): Promise<CubRow[]> {
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
    });
  }

  return rows;
}
