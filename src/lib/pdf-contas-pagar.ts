import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { SiengeOutcome } from "@/types/sienge";

interface PDFData {
  items: SiengeOutcome[];
  totalAPagar: number;
  periodLabel: string;
  companyName: string;
  generatedAt: string;
}

function fmtCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

function fmtDate(dateStr: string): string {
  if (!dateStr) return "";
  const [y, m, d] = dateStr.split("-");
  return `${d}/${m}/${y}`;
}

export function generateContasPagarPDF(data: PDFData) {
  const { items, totalAPagar, periodLabel, companyName, generatedAt } = data;

  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 15;

  // Sort items by company name, then by due date
  const sorted = [...items].sort((a, b) => {
    const cmp = a.companyName.localeCompare(b.companyName);
    if (cmp !== 0) return cmp;
    return a.dueDate.localeCompare(b.dueDate);
  });

  // Group by company for subtotals
  const byCompany = new Map<string, SiengeOutcome[]>();
  sorted.forEach(item => {
    const list = byCompany.get(item.companyName) || [];
    list.push(item);
    byCompany.set(item.companyName, list);
  });

  // ─── Header ───────────────────────────────────────────────
  const headerColor: [number, number, number] = [158, 27, 47]; // brand red

  doc.setFillColor(...headerColor);
  doc.rect(0, 0, pageWidth, 28, "F");

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text(companyName, margin, 12);

  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.text("Relatorio de Contas a Pagar", margin, 19);

  doc.setFontSize(8);
  doc.text(`Gerado em ${generatedAt}`, pageWidth - margin, 12, { align: "right" });
  doc.text(periodLabel, pageWidth - margin, 19, { align: "right" });

  // ─── Summary boxes ────────────────────────────────────────
  const boxY = 34;
  const boxH = 18;
  const boxW = (pageWidth - margin * 2 - 10) / 3;

  // Box 1: Total
  doc.setFillColor(254, 242, 242); // red-50
  doc.roundedRect(margin, boxY, boxW, boxH, 2, 2, "F");
  doc.setTextColor(153, 27, 27); // red-800
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.text("TOTAL A PAGAR", margin + 4, boxY + 6);
  doc.setFontSize(14);
  doc.text(fmtCurrency(totalAPagar), margin + 4, boxY + 14);

  // Box 2: Parcelas
  doc.setFillColor(240, 253, 244); // green-50
  doc.roundedRect(margin + boxW + 5, boxY, boxW, boxH, 2, 2, "F");
  doc.setTextColor(22, 101, 52); // green-800
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.text("PARCELAS", margin + boxW + 9, boxY + 6);
  doc.setFontSize(14);
  doc.text(`${items.length}`, margin + boxW + 9, boxY + 14);

  // Box 3: Empresas
  doc.setFillColor(245, 243, 255); // violet-50
  doc.roundedRect(margin + (boxW + 5) * 2, boxY, boxW, boxH, 2, 2, "F");
  doc.setTextColor(91, 33, 182); // violet-800
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.text("EMPRESAS", margin + (boxW + 5) * 2 + 4, boxY + 6);
  doc.setFontSize(14);
  doc.text(`${byCompany.size}`, margin + (boxW + 5) * 2 + 4, boxY + 14);

  // ─── Table ────────────────────────────────────────────────
  const tableRows: (string | { content: string; colSpan?: number; styles?: Record<string, unknown> })[][] = [];

  byCompany.forEach((companyItems, compName) => {
    // Company header row
    tableRows.push([
      {
        content: compName,
        colSpan: 7,
        styles: {
          fillColor: [241, 245, 249], // slate-100
          textColor: [30, 41, 59],
          fontStyle: "bold",
          fontSize: 9,
          cellPadding: { top: 3, bottom: 3, left: 4, right: 4 },
        },
      },
      "", "", "", "", "", "",
    ]);

    // Data rows
    companyItems.forEach(item => {
      const effectiveAmt = item.correctedBalanceAmount - (item.taxAmount || 0);
      tableRows.push([
        fmtDate(item.dueDate),
        item.creditorName.length > 45 ? item.creditorName.substring(0, 45) + "..." : item.creditorName,
        item.documentNumber || "-",
        item.documentIdentificationName || item.documentIdentificationId || "-",
        `${item.billId}/${item.installmentId}`,
        fmtCurrency(item.originalAmount),
        fmtCurrency(effectiveAmt),
      ]);
    });

    // Company subtotal
    const companyTotal = companyItems.reduce((s, i) => s + i.correctedBalanceAmount - (i.taxAmount || 0), 0);
    tableRows.push([
      "",
      "",
      "",
      "",
      {
        content: `Subtotal ${compName.length > 20 ? compName.substring(0, 20) + "..." : compName}`,
        styles: { fontStyle: "bold", halign: "right", fontSize: 7.5 },
      },
      "",
      {
        content: fmtCurrency(companyTotal),
        styles: { fontStyle: "bold", halign: "right", fillColor: [241, 245, 249] },
      },
    ]);
  });

  // Total row
  tableRows.push([
    "",
    "",
    "",
    "",
    {
      content: "TOTAL GERAL",
      styles: {
        fontStyle: "bold",
        halign: "right",
        fillColor: [30, 41, 59],
        textColor: [255, 255, 255],
        fontSize: 9,
      },
    },
    "",
    {
      content: fmtCurrency(totalAPagar),
      styles: {
        fontStyle: "bold",
        halign: "right",
        fillColor: [30, 41, 59],
        textColor: [255, 255, 255],
        fontSize: 9,
      },
    },
  ]);

  autoTable(doc, {
    startY: boxY + boxH + 6,
    margin: { left: margin, right: margin },
    head: [[
      "Vencimento",
      "Credor",
      "Nº Documento",
      "Tipo Doc",
      "Titulo/Parc",
      "Valor Original",
      "Saldo",
    ]],
    body: tableRows,
    headStyles: {
      fillColor: headerColor,
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 8,
      cellPadding: { top: 3, bottom: 3, left: 4, right: 4 },
    },
    bodyStyles: {
      fontSize: 7.5,
      cellPadding: { top: 2, bottom: 2, left: 4, right: 4 },
      textColor: [51, 65, 85], // slate-700
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252], // slate-50
    },
    columnStyles: {
      0: { cellWidth: 22, halign: "center" },
      1: { cellWidth: "auto" },
      2: { cellWidth: 28 },
      3: { cellWidth: 22 },
      4: { cellWidth: 22, halign: "center" },
      5: { cellWidth: 30, halign: "right" },
      6: { cellWidth: 30, halign: "right" },
    },
    didDrawPage: () => {
      // Footer on every page
      const pageNum = doc.internal.pages.length - 1;
      doc.setFillColor(248, 250, 252);
      doc.rect(0, pageHeight - 10, pageWidth, 10, "F");
      doc.setFontSize(7);
      doc.setTextColor(148, 163, 184); // slate-400
      doc.setFont("helvetica", "normal");
      doc.text(
        `${companyName} - Sistema de Gestao`,
        margin,
        pageHeight - 4
      );
      doc.text(
        `Pagina ${pageNum}`,
        pageWidth - margin,
        pageHeight - 4,
        { align: "right" }
      );
    },
  });

  // Open in new tab
  const blobUrl = doc.output("bloburl");
  window.open(blobUrl, "_blank");
}
