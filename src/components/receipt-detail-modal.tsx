"use client";

import { useState } from "react";
import { ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDate, effectiveOpenAmount } from "@/lib/dashboard-utils";
import { SiengeIncome } from "@/types/sienge";

type HistSortField = "paymentDate" | "billId" | "termLabel" | "netAmount";

// Cor da tag por tipo de parcela (paymentTerm.id do Sienge).
function termBadgeClass(termId: string): string {
  switch (termId) {
    case "CH": // Entrega das chaves — destaque
      return "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300";
    case "PA": // Parcela Anual
    case "PS": // Parcelas Semestrais
    case "PQ": // Parcelas Quadrimestrais
      return "border-violet-300 bg-violet-50 text-violet-700 dark:border-violet-700 dark:bg-violet-950/40 dark:text-violet-300";
    case "EN": // Entrada
    case "AT": // Ato
    case "PI": // Parcelas Iniciais
      return "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-300";
    case "PE": // Permuta
      return "border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-700 dark:bg-rose-950/40 dark:text-rose-300";
    case "FI": // Financiamento
      return "border-cyan-300 bg-cyan-50 text-cyan-700 dark:border-cyan-700 dark:bg-cyan-950/40 dark:text-cyan-300";
    case "PM": // Parcelas Mensais
    case "PD": // Parcelas 10 meses
      return "border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-700 dark:bg-blue-950/40 dark:text-blue-300";
    default:
      return "border-slate-300 bg-slate-50 text-slate-600 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300";
  }
}

interface Props {
  item: SiengeIncome | null;
  open: boolean;
  onClose: () => void;
  // Todos os títulos do mesmo cliente (abertos + pagos) para montar o histórico
  // de pagamentos. Opcional — quando ausente, a seção de histórico não aparece.
  clientHistory?: SiengeIncome[];
}

const SectionHeader = ({ children }: { children: React.ReactNode }) => (
  <h3 className="text-[11px] font-bold uppercase tracking-widest text-emerald-700 dark:text-emerald-300 mb-3 px-3 py-1.5 bg-emerald-50 dark:bg-emerald-950/40 border-l-[3px] border-emerald-500 dark:border-emerald-400 rounded-r-md">
    {children}
  </h3>
);

const KV = ({ label, value, valueClass = "" }: { label: string; value: React.ReactNode; valueClass?: string }) => (
  <div className="flex items-center justify-between gap-3 py-1">
    <span className="text-xs text-slate-500 dark:text-slate-400">{label}</span>
    <span className={`text-xs font-medium text-slate-800 dark:text-slate-200 ${valueClass}`}>{value}</span>
  </div>
);

const MoneyKV = ({ label, value, highlight = false }: { label: string; value: number; highlight?: boolean }) => (
  <div className={`flex items-center justify-between gap-3 py-1.5 px-2 rounded ${highlight ? "bg-emerald-50 dark:bg-emerald-950/30" : ""}`}>
    <span className={`text-xs ${highlight ? "font-bold text-emerald-700 dark:text-emerald-300" : "text-slate-500 dark:text-slate-400"}`}>{label}</span>
    <span className={`text-xs tabular-nums ${highlight ? "font-bold text-emerald-700 dark:text-emerald-300" : "font-medium text-slate-800 dark:text-slate-200"}`}>
      {formatCurrency(value)}
    </span>
  </div>
);

export function ReceiptDetailModal({ item, open, onClose, clientHistory }: Props) {
  const [histSort, setHistSort] = useState<{ field: HistSortField; dir: "asc" | "desc" }>({ field: "paymentDate", dir: "desc" });
  if (!item) return null;

  const aberto = effectiveOpenAmount(item, true);
  const cats = item.paymentsCategories || [];
  const payments = item.payments || [];

  const totalRecebido = payments.reduce((s, p) => s + (p.netAmount || 0), 0);
  const paymentsSorted = [...payments].sort((a, b) => (b.paymentDate || "").localeCompare(a.paymentDate || ""));

  // Histórico completo de pagamentos do cliente (todos os títulos).
  const history = (clientHistory || []).filter(b => b.billId !== undefined);
  const termLabel = (b: SiengeIncome): string => {
    const t = b.paymentTerm;
    const desc = (t?.descrition || t?.description || "").trim();
    if (desc) return b.installmentNumber ? `${desc} (${b.installmentNumber})` : desc;
    return b.installmentNumber ? `Parcela ${b.installmentNumber}` : "Recebimento";
  };
  const clientReceipts = history
    .flatMap(bill =>
      (bill.payments || [])
        .filter(p => p.paymentDate)
        .map(p => ({
          paymentDate: p.paymentDate as string,
          billId: bill.billId,
          installmentId: bill.installmentId,
          documentNumber: bill.documentNumber || "",
          termLabel: termLabel(bill),
          termId: (bill.paymentTerm?.id || "").toUpperCase(),
          netAmount: p.netAmount || 0,
        }))
    );
  clientReceipts.sort((a, b) => {
    let cmp = 0;
    switch (histSort.field) {
      case "paymentDate": cmp = (a.paymentDate || "").localeCompare(b.paymentDate || ""); break;
      case "billId": cmp = (a.billId - b.billId) || (a.installmentId - b.installmentId); break;
      case "termLabel": cmp = a.termLabel.localeCompare(b.termLabel); break;
      case "netAmount": cmp = a.netAmount - b.netAmount; break;
    }
    return histSort.dir === "asc" ? cmp : -cmp;
  });
  const clientTotalRecebido = clientReceipts.reduce((s, r) => s + r.netAmount, 0);
  const clientTotalAberto = history.reduce((s, b) => s + effectiveOpenAmount(b, true), 0);
  const clientNumTitulos = new Set(history.map(b => b.billId)).size;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto p-0 gap-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-slate-200 dark:border-slate-700">
          <DialogTitle className="text-base font-bold text-slate-800 dark:text-slate-100">
            {item.clientName || "(sem cliente)"}
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-1.5 mt-1">
            <span>{item.companyName}</span>
            {item.documentIdentificationName && <><span>·</span><span>{item.documentIdentificationName}</span></>}
            {item.documentNumber && <><span>·</span><span className="font-mono">{item.documentNumber}</span></>}
            <Badge variant="outline" className="ml-1 text-[10px] font-mono">
              Bill #{item.billId}-{item.installmentId}
            </Badge>
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 py-5 space-y-5">
          {/* SEÇÃO 1: Status & Datas */}
          <section>
            <SectionHeader>Status & Datas</SectionHeader>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6">
              <KV label="Vencimento" value={formatDate(item.dueDate)} />
              {item.billDate && <KV label="Data da conta" value={formatDate(item.billDate)} />}
              {item.issueDate && <KV label="Emissão" value={formatDate(item.issueDate)} />}
              {item.registeredDate && (
                <KV
                  label="Registrado"
                  value={`${formatDate(item.registeredDate)}${item.registeredBy ? ` · ${item.registeredBy}` : ""}`}
                />
              )}
            </div>
            <div className="flex flex-wrap gap-1.5 mt-3">
              {item.authorizationStatus && (
                <Badge
                  variant="outline"
                  className={`text-[10px] ${
                    item.authorizationStatus === "S"
                      ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300"
                      : "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300"
                  }`}
                >
                  {item.authorizationStatus === "S" ? "Autorizado" : `Autorização: ${item.authorizationStatus}`}
                </Badge>
              )}
              {item.consistencyStatus && (
                <Badge
                  variant="outline"
                  className={`text-[10px] ${
                    item.consistencyStatus === "S"
                      ? "border-slate-300 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                      : "border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300"
                  }`}
                >
                  Consistência: {item.consistencyStatus}
                </Badge>
              )}
              {item.forecastDocument === "S" && (
                <Badge variant="outline" className="text-[10px] border-violet-300 bg-violet-50 text-violet-700 dark:border-violet-800 dark:bg-violet-950/30 dark:text-violet-300">
                  Previsão
                </Badge>
              )}
              {item.indexerName && (
                <Badge variant="outline" className="text-[10px] border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300">
                  Indexador: {item.indexerName}
                </Badge>
              )}
            </div>
          </section>

          {/* SEÇÃO 2: Valores */}
          <section>
            <SectionHeader>Valores</SectionHeader>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6">
              <MoneyKV label="Valor original" value={item.originalAmount || 0} />
              <MoneyKV label="Saldo nominal" value={item.balanceAmount || 0} />
              <MoneyKV label="Saldo corrigido" value={item.correctedBalanceAmount || 0} />
              {(item.discountAmount || 0) > 0 && <MoneyKV label="Desconto" value={item.discountAmount} />}
              {(item.taxAmount || 0) > 0 && <MoneyKV label="Imposto" value={item.taxAmount} />}
            </div>
            <div className="mt-2 space-y-1">
              <MoneyKV label="Valor em aberto" value={aberto} highlight />
            </div>
          </section>

          {/* SEÇÃO 3: Centro de Custo & Categoria */}
          <section>
            <SectionHeader>Centro de Custo & Categoria Financeira</SectionHeader>
            {cats.length === 0 ? (
              <p className="text-xs text-slate-400 dark:text-slate-500 italic">Sem rateio de centro de custo</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700">
                      <th className="text-left font-semibold py-1.5 px-2">Centro de Custo</th>
                      <th className="text-left font-semibold py-1.5 px-2">Categoria</th>
                      <th className="text-right font-semibold py-1.5 px-2 w-20">Rateio</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cats.map((c, i) => (
                      <tr key={i} className="border-b border-slate-100 dark:border-slate-800 last:border-b-0">
                        <td className="py-1.5 px-2 text-slate-700 dark:text-slate-300">{c.costCenterName || "-"}</td>
                        <td className="py-1.5 px-2 text-slate-700 dark:text-slate-300">
                          <span className="font-mono text-[10px] text-slate-400 mr-1">{c.financialCategoryId}</span>
                          {c.financialCategoryName}
                        </td>
                        <td className="py-1.5 px-2 text-right tabular-nums text-slate-700 dark:text-slate-300">
                          {(c.financialCategoryRate ?? 100).toFixed(0)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* SEÇÃO 4: Recebimentos Realizados */}
          {paymentsSorted.length > 0 && (
            <section>
              <SectionHeader>Recebimentos Realizados</SectionHeader>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700">
                      <th className="text-left font-semibold py-1.5 px-2">Data</th>
                      <th className="text-left font-semibold py-1.5 px-2">Operação</th>
                      <th className="text-right font-semibold py-1.5 px-2">Bruto</th>
                      <th className="text-right font-semibold py-1.5 px-2">Juros</th>
                      <th className="text-right font-semibold py-1.5 px-2">Multa</th>
                      <th className="text-right font-semibold py-1.5 px-2">Desconto</th>
                      <th className="text-right font-semibold py-1.5 px-2">Líquido</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paymentsSorted.map((p, i) => {
                      const isEstorno = (p.netAmount || 0) < 0;
                      return (
                        <tr key={i} className={`border-b border-slate-100 dark:border-slate-800 last:border-b-0 ${isEstorno ? "italic" : ""}`}>
                          <td className="py-1.5 px-2 text-slate-700 dark:text-slate-300">{formatDate(p.paymentDate)}</td>
                          <td className="py-1.5 px-2 text-slate-700 dark:text-slate-300">
                            {isEstorno && <span className="text-red-600 dark:text-red-300/80 font-semibold mr-1">Estorno:</span>}
                            {p.operationTypeName || "-"}
                          </td>
                          <td className="py-1.5 px-2 text-right tabular-nums text-slate-600 dark:text-slate-400">{formatCurrency(p.grossAmount || 0)}</td>
                          <td className="py-1.5 px-2 text-right tabular-nums text-slate-600 dark:text-slate-400">{(p.interestAmount || 0) > 0 ? formatCurrency(p.interestAmount) : "-"}</td>
                          <td className="py-1.5 px-2 text-right tabular-nums text-slate-600 dark:text-slate-400">{(p.fineAmount || 0) > 0 ? formatCurrency(p.fineAmount) : "-"}</td>
                          <td className="py-1.5 px-2 text-right tabular-nums text-slate-600 dark:text-slate-400">{(p.discountAmount || 0) > 0 ? formatCurrency(p.discountAmount) : "-"}</td>
                          <td className={`py-1.5 px-2 text-right tabular-nums font-semibold ${isEstorno ? "text-red-600 dark:text-red-300/80" : "text-slate-800 dark:text-slate-200"}`}>
                            {formatCurrency(p.netAmount || 0)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-slate-300 dark:border-slate-600">
                      <td colSpan={6} className="py-2 px-2 text-right text-[10px] uppercase tracking-wider font-bold text-slate-600 dark:text-slate-400">
                        Total Líquido Recebido
                      </td>
                      <td className={`py-2 px-2 text-right tabular-nums font-bold ${totalRecebido < 0 ? "text-red-600 dark:text-red-300/80" : "text-slate-800 dark:text-slate-200"}`}>
                        {formatCurrency(totalRecebido)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </section>
          )}

          {/* SEÇÃO 4b: Histórico de Pagamentos do Cliente (todos os títulos) */}
          {clientReceipts.length > 0 && (
            <section>
              <SectionHeader>Histórico de Pagamentos do Cliente</SectionHeader>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-3">
                <MoneyKV label="Total recebido" value={clientTotalRecebido} highlight />
                <MoneyKV label="Total em aberto" value={clientTotalAberto} />
                <div className="flex items-center justify-between gap-3 py-1.5 px-2 rounded">
                  <span className="text-xs text-slate-500 dark:text-slate-400">Títulos</span>
                  <span className="text-xs font-medium tabular-nums text-slate-800 dark:text-slate-200">{clientNumTitulos}</span>
                </div>
              </div>
              <div className="overflow-x-auto max-h-64 overflow-y-auto rounded-md border border-slate-200 dark:border-slate-700">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-slate-50 dark:bg-slate-800/90 backdrop-blur">
                    <tr className="text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700">
                      {([
                        { key: "paymentDate" as const, label: "Data", align: "left" },
                        { key: "billId" as const, label: "Título", align: "left" },
                        { key: "termLabel" as const, label: "Tipo de Parcela", align: "left" },
                        { key: "netAmount" as const, label: "Líquido", align: "right" },
                      ]).map(col => {
                        const isSorted = histSort.field === col.key;
                        const Icon = isSorted ? (histSort.dir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
                        return (
                          <th key={col.key} className={`font-semibold py-1.5 px-2 ${col.align === "right" ? "text-right" : "text-left"}`}>
                            <button
                              type="button"
                              onClick={() => setHistSort(prev => ({ field: col.key, dir: prev.field === col.key && prev.dir === "desc" ? "asc" : "desc" }))}
                              className={`inline-flex items-center gap-1 uppercase tracking-wider hover:text-slate-700 dark:hover:text-slate-200 select-none ${col.align === "right" ? "flex-row-reverse" : ""}`}
                            >
                              {col.label}
                              <Icon className={`h-3 w-3 ${isSorted ? "text-emerald-500" : "text-slate-300 dark:text-slate-600"}`} />
                            </button>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {clientReceipts.map((r, i) => {
                      const isEstorno = r.netAmount < 0;
                      const isCurrentBill = r.billId === item.billId && r.installmentId === item.installmentId;
                      return (
                        <tr key={i} className={`border-b border-slate-100 dark:border-slate-800 last:border-b-0 ${isCurrentBill ? "bg-emerald-50/60 dark:bg-emerald-950/20" : ""} ${isEstorno ? "italic" : ""}`}>
                          <td className="py-1.5 px-2 text-slate-700 dark:text-slate-300 whitespace-nowrap">{formatDate(r.paymentDate)}</td>
                          <td className="py-1.5 px-2 text-slate-500 dark:text-slate-400 font-mono text-[10px] whitespace-nowrap">
                            #{r.billId}-{r.installmentId}
                            {r.documentNumber && <span className="ml-1 text-slate-400">· {r.documentNumber}</span>}
                          </td>
                          <td className="py-1.5 px-2">
                            {isEstorno && <span className="text-red-600 dark:text-red-300/80 font-semibold mr-1 text-[10px] uppercase">Estorno</span>}
                            <span className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-medium whitespace-nowrap ${termBadgeClass(r.termId)}`}>
                              {r.termLabel}
                            </span>
                          </td>
                          <td className={`py-1.5 px-2 text-right tabular-nums font-semibold ${isEstorno ? "text-red-600 dark:text-red-300/80" : "text-slate-800 dark:text-slate-200"}`}>
                            {formatCurrency(r.netAmount)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1.5">
                {clientReceipts.length} pagamento(s) · linha destacada = parcela atual
              </p>
            </section>
          )}

          {/* SEÇÃO 5: Observação */}
          {item.observation && item.observation.trim() && (
            <section>
              <SectionHeader>Observação</SectionHeader>
              <p className="text-xs text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed">
                {item.observation}
              </p>
            </section>
          )}
        </div>

        <DialogFooter className="px-6 py-4 border-t border-slate-200 dark:border-slate-700">
          <Button variant="outline" onClick={onClose}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
