// Série histórica mensal do FipeZAP (Fipe) — preço médio de venda do m²
// residencial por cidade. Usada para pôr o m² de Balneário Camboriú ao lado
// do CUB-SC no Comparar dos Indicadores (Edielson, 06/11/2026).
//
// Fonte: planilha pública "fipezap-serieshistoricas.xlsx" (uma aba por
// cidade; ~4,6 MB). Na aba, o primeiro bloco é "Imóveis residenciais › Venda"
// com os grupos Número-índice · Var. mensal (%) · Var. em 12 meses (%) ·
// Preço médio (R$/m²), cada um com as colunas Total/1D/2D/3D/4D. Lemos só o
// "Total" de cada grupo. As variações vêm como fração (0,0031 = 0,31 %).
// Os preços são médias móveis trimestrais (nota da própria Fipe).

const URL_FIPEZAP = "https://downloads.fipe.org.br/indices/fipezap/fipezap-serieshistoricas.xlsx";

export const CIDADE_FIPEZAP_BC = "Balneário Camboriú";

export type FipezapRow = {
  ano: number;
  mes: number;
  /** Número-índice (base 100 na origem da série). */
  indice: number | null;
  /** Variação mensal, já em % (0,31 = 0,31 %). */
  variacao_pct: number;
  /** Variação em 12 meses, em %, ou null nos 12 primeiros meses. */
  acumulado_12m_pct: number | null;
  /** Preço médio de venda, R$/m². */
  valor_m2: number | null;
};

function semAcento(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

/** Célula numérica do exceljs (número puro ou resultado de fórmula); "." = sem dado. */
function num(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (v && typeof v === "object" && "result" in v) {
    const r = (v as { result: unknown }).result;
    return typeof r === "number" && Number.isFinite(r) ? r : null;
  }
  return null;
}

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

export async function fetchFipezapRows(
  cidade: string = CIDADE_FIPEZAP_BC
): Promise<{ rows: FipezapRow[]; referencia: string | null }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 90_000);
  let buf: Buffer;
  try {
    const res = await fetch(URL_FIPEZAP, {
      signal: ctrl.signal,
      cache: "no-store",
      headers: { "User-Agent": "Mozilla/5.0 (painel DTSIENGE; indicadores)" },
    });
    if (!res.ok) throw new Error(`FipeZAP respondeu HTTP ${res.status}`);
    buf = Buffer.from(await res.arrayBuffer());
  } finally {
    clearTimeout(timer);
  }

  // exceljs só aqui (import dinâmico, como no exportador de Excel).
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ArrayBuffer);

  const alvo = semAcento(cidade);
  const ws =
    wb.worksheets.find((w) => semAcento(w.name) === alvo) ??
    wb.worksheets.find((w) => semAcento(w.name).includes(alvo));
  if (!ws) throw new Error(`Aba "${cidade}" não encontrada na planilha do FipeZAP`);

  // Linha "Data | Total | 1D ..." e, logo acima, a linha dos grupos.
  let linhaData = -1;
  ws.eachRow((row, n) => {
    if (linhaData > 0) return;
    const vals = row.values as unknown[];
    if (vals.some((v) => typeof v === "string" && semAcento(v) === "data")) linhaData = n;
  });
  if (linhaData < 2) throw new Error("Cabeçalho da planilha do FipeZAP não reconhecido");

  // row.values do exceljs é 1-based (índice 0 vazio): o índice achado aqui é
  // o número da coluna e vale igual para todas as linhas.
  const grupos = ws.getRow(linhaData - 1).values as unknown[];
  const colDe = (prefixo: string) =>
    grupos.findIndex((v) => typeof v === "string" && semAcento(v).startsWith(prefixo));
  const cIndice = colDe("numero-indice");
  const cMensal = colDe("var. mensal");
  const c12m = colDe("var. em 12 meses");
  const cPreco = colDe("preco medio");
  const cData = (ws.getRow(linhaData).values as unknown[]).findIndex(
    (v) => typeof v === "string" && semAcento(v) === "data"
  );
  if (cIndice < 0 || cMensal < 0 || cData < 0) {
    throw new Error("Colunas da planilha do FipeZAP não reconhecidas");
  }

  const rows: FipezapRow[] = [];
  ws.eachRow((row, n) => {
    if (n <= linhaData) return;
    const vals = row.values as unknown[];
    const d = vals[cData];
    if (!(d instanceof Date)) return;
    const mensal = num(vals[cMensal]);
    if (mensal === null) return; // "." = mês sem dado
    // A célula é meia-noite; +12 h garante o dia certo em qualquer fuso.
    const dt = new Date(d.getTime() + 12 * 3600 * 1000);
    const var12 = c12m >= 0 ? num(vals[c12m]) : null;
    rows.push({
      ano: dt.getUTCFullYear(),
      mes: dt.getUTCMonth() + 1,
      indice: num(vals[cIndice]),
      variacao_pct: mensal * 100,
      acumulado_12m_pct: var12 === null ? null : var12 * 100,
      valor_m2: cPreco >= 0 ? num(vals[cPreco]) : null,
    });
  });
  rows.sort((a, b) => a.ano - b.ano || a.mes - b.mes);

  const ultimo = rows[rows.length - 1];
  const referencia = ultimo ? `${MESES[ultimo.mes - 1]}/${String(ultimo.ano).slice(-2)}` : null;
  return { rows, referencia };
}
