// Planilha "Unidades vendidas" formatada (trazida do Financeiro da Leven em
// 22/10/2026): título,
// cabeçalho na cor da marca, linhas zebradas, filtro, cabeçalho congelado,
// datas e valores como números de verdade (somam e filtram no Excel) e
// linha de total com fórmula. Segunda aba: estoque do Sienge por situação.
// exceljs porque a versão gratuita do "xlsx" não grava formatação.

export interface LinhaUnidadeVendida {
  empreendimento: string; unidade: string; tipo: string; pavimento: number | null; area: number | null;
  estoque: string; contrato: string; situacao: string; data: string; // ISO
  cliente: string; permuta: boolean; valor: number;
  situacaoQuadro: string;  // situação da unidade no Quadro Espelho
}

const MARINHO = "FF14284B", LARANJA = "FFB9561F", ZEBRA = "FFF4F6FA", BORDA = "FFD9DEE7", CINZA = "FF64748B";
// Cores das situações do Quadro Espelho (statusColors em comercial-view), em ARGB.
const COR_SITUACAO: Record<string, string> = {
  "Vendida": "FFEF4444", "Disponível": "FF10B981", "Reserva Técnica": "FF3B82F6",
  "Proposta": "FFF97316", "Vendido/Terceiros": "FFEC4899",
};
const fmtData = (d: Date) => d.toLocaleDateString("pt-BR");

export async function planilhaUnidadesVendidas(
  linhas: LinhaUnidadeVendida[],
  estoque: { situacao: string; unidades: number }[],
  opcoes: { empresa: string; filtros: string[]; agora?: Date },
): Promise<Blob> {
  const ExcelJS = (await import("exceljs")).default;
  const agora = opcoes.agora ?? new Date();
  const wb = new ExcelJS.Workbook();
  wb.creator = opcoes.empresa; wb.created = agora;

  // ── Aba 1: unidades vendidas ──
  const ws = wb.addWorksheet("Unidades vendidas", {
    views: [{ state: "frozen", ySplit: 5, showGridLines: false }],
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9, margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 } },
    headerFooter: { oddFooter: "&L&8" + opcoes.empresa + "&R&8Página &P de &N" },
  });
  const todas = [
    { h: "Unidade", w: 10, k: "unidade" }, { h: "Tipo", w: 13, k: "tipo" }, { h: "Pav.", w: 6, k: "pavimento" },
    { h: "Área (m²)", w: 10, k: "area" }, { h: "Situação", w: 18, k: "situacaoQuadro" }, { h: "Contrato", w: 19, k: "contrato" },
    { h: "Contrato (Sienge)", w: 12, k: "situacao" }, { h: "Data", w: 11, k: "data" }, { h: "Cliente", w: 54, k: "cliente" },
    { h: "Permuta", w: 9, k: "permuta" }, { h: "Valor da unidade", w: 17, k: "valor" }, { h: "Empreendimento", w: 34, k: "empreendimento" },
  ] as const;
  // um empreendimento só: o título já diz qual é, a coluna sai
  const variosEmp = new Set(linhas.map(l => l.empreendimento)).size > 1;
  const cols = variosEmp ? todas : todas.slice(0, -1);
  ws.columns = cols.map(c => ({ key: c.k, width: c.w }));
  const ultima = String.fromCharCode(64 + cols.length);

  const total = linhas.reduce((s, l) => s + l.valor, 0);
  const contratos = new Set(linhas.map(l => l.contrato)).size;
  ws.mergeCells(`A1:${ultima}1`); ws.mergeCells(`A2:${ultima}2`); ws.mergeCells(`A3:${ultima}3`);
  Object.assign(ws.getCell("A1"), { value: `${opcoes.empresa} · Unidades vendidas` });
  ws.getCell("A1").font = { name: "Calibri", size: 16, bold: true, color: { argb: MARINHO } };
  ws.getRow(1).height = 26;
  ws.getCell("A2").value = `${linhas.length} unidades · ${contratos} contratos · ${total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`;
  ws.getCell("A2").font = { size: 11, bold: true, color: { argb: LARANJA } };
  ws.getCell("A3").value = `Gerado em ${fmtData(agora)} às ${agora.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })} · fonte: Sienge${opcoes.filtros.length ? " · filtros: " + opcoes.filtros.join(" · ") : ""}`;
  ws.getCell("A3").font = { size: 9, italic: true, color: { argb: CINZA } };

  const cab = ws.getRow(5);
  cols.forEach((c, i) => { cab.getCell(i + 1).value = c.h; });
  cab.height = 22;
  cab.eachCell(cel => {
    cel.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
    cel.fill = { type: "pattern", pattern: "solid", fgColor: { argb: MARINHO } };
    cel.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  });

  linhas.forEach((l, i) => {
    const r = ws.addRow({
      ...l,
      data: l.data ? new Date(`${l.data.slice(0, 10)}T12:00:00`) : null,
      permuta: l.permuta ? "Sim" : "",
    });
    r.height = 18;
    r.eachCell({ includeEmpty: true }, (cel, n) => {
      cel.font = { size: 10, color: { argb: "FF1E293B" } };
      if (i % 2 === 1) cel.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ZEBRA } };
      cel.border = { bottom: { style: "hair", color: { argb: BORDA } } };
      cel.alignment = { vertical: "middle", horizontal: [1, 3, 5, 7, 8, 10].includes(n) ? "center" : n === 4 || n === 11 ? "right" : "left" };
    });
    r.getCell("unidade").font = { size: 10, bold: true, color: { argb: MARINHO } };
    r.getCell("area").numFmt = '#,##0.00';
    r.getCell("data").numFmt = "dd/mm/yyyy";
    r.getCell("valor").numFmt = '"R$" #,##0.00';
    const corEst = COR_SITUACAO[l.situacaoQuadro]; if (corEst) r.getCell("situacaoQuadro").font = { size: 10, bold: true, color: { argb: corEst } };
    if (l.situacao !== "Emitido") r.getCell("situacao").font = { size: 10, bold: true, color: { argb: "FFF97316" } };
    if (l.permuta) r.getCell("permuta").font = { size: 10, bold: true, color: { argb: "FF8B5CF6" } };
  });

  const ini = 6, fim = 5 + linhas.length;
  const tot = ws.addRow([]);
  tot.getCell(1).value = "Total";
  tot.getCell(2).value = { formula: `COUNTA(A${ini}:A${fim})&" unidades"`, result: `${linhas.length} unidades` };
  tot.getCell(11).value = { formula: `SUBTOTAL(9,K${ini}:K${fim})`, result: Math.round(total * 100) / 100 };
  tot.getCell(11).numFmt = '"R$" #,##0.00';
  tot.height = 22;
  tot.eachCell({ includeEmpty: true }, (cel, n) => {
    if (n > cols.length) return;
    cel.font = { bold: true, size: 10, color: { argb: MARINHO } };
    cel.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8ECF4" } };
    cel.border = { top: { style: "medium", color: { argb: MARINHO } } };
    cel.alignment = { vertical: "middle", horizontal: n === 11 ? "right" : "left" };
  });
  ws.autoFilter = { from: { row: 5, column: 1 }, to: { row: fim, column: cols.length } };
  ws.pageSetup.printTitlesRow = "5:5";

  // ── Aba 2: estoque no Sienge ──
  const we = wb.addWorksheet("Estoque no Sienge", { views: [{ showGridLines: false }] });
  we.columns = [{ width: 4 }, { width: 22 }, { width: 12 }, { width: 12 }];
  we.mergeCells("B1:D1");
  we.getCell("B1").value = "Estoque no Sienge";
  we.getCell("B1").font = { size: 16, bold: true, color: { argb: MARINHO } };
  we.getRow(1).height = 26;
  we.getCell("B2").value = `Posição em ${fmtData(agora)}${opcoes.filtros.length ? " · " + opcoes.filtros.join(" · ") : ""}`;
  we.getCell("B2").font = { size: 9, italic: true, color: { argb: CINZA } };
  const h = we.getRow(4);
  ["Situação", "Unidades", "%"].forEach((t, i) => { const c = h.getCell(i + 2); c.value = t; c.font = { bold: true, color: { argb: "FFFFFFFF" } }; c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: MARINHO } }; c.alignment = { horizontal: i ? "center" : "left", vertical: "middle" }; });
  h.height = 22;
  const somaEst = estoque.reduce((s, e) => s + e.unidades, 0);
  const ePrim = 5, eUlt = 4 + estoque.length;
  estoque.forEach((e, i) => {
    const r = we.getRow(5 + i); r.height = 20;
    r.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: COR_SITUACAO[e.situacao] ?? "FF94A3B8" } };
    r.getCell(2).value = e.situacao; r.getCell(2).font = { bold: true, color: { argb: "FF1E293B" } };
    r.getCell(3).value = e.unidades; r.getCell(3).alignment = { horizontal: "center" };
    r.getCell(4).value = { formula: `C${5 + i}/SUM(C${ePrim}:C${eUlt})`, result: somaEst ? e.unidades / somaEst : 0 };
    r.getCell(4).numFmt = "0.0%"; r.getCell(4).alignment = { horizontal: "center" };
    [2, 3, 4].forEach(n => { r.getCell(n).border = { bottom: { style: "hair", color: { argb: BORDA } } }; });
  });
  const rt = we.getRow(eUlt + 1); rt.height = 22;
  rt.getCell(2).value = "Total";
  rt.getCell(3).value = { formula: `SUM(C${ePrim}:C${eUlt})`, result: somaEst };
  rt.getCell(4).value = { formula: `SUM(D${ePrim}:D${eUlt})`, result: 1 }; rt.getCell(4).numFmt = "0.0%";
  [2, 3, 4].forEach(n => { const c = rt.getCell(n); c.font = { bold: true, color: { argb: MARINHO } }; c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8ECF4" } }; c.border = { top: { style: "medium", color: { argb: MARINHO } } }; c.alignment = { horizontal: n === 2 ? "left" : "center", vertical: "middle" }; });

  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}
