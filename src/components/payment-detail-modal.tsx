"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDate, effectiveOpenAmount } from "@/lib/dashboard-utils";
import { SiengeOutcome } from "@/types/sienge";

interface Props {
  item: SiengeOutcome | null;
  open: boolean;
  onClose: () => void;
}

// Encargos (multa 2% + juros 1% a.m. pro-rata) — fórmula validada em
// contas-table.tsx. Copia local pra nao depender de useCallback interno
// do componente original. Retorna 0 quando nao vencido.
function calcEncargos(item: SiengeOutcome): number {
  if (!item.dueDate) return 0;
  const due = new Date(item.dueDate + "T00:00:00");
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  let dias = Math.floor((hoje.getTime() - due.getTime()) / 86400000);
  if (dias <= 0) return 0;
  if (dias > 365) dias = dias - 1;
  const saldo = item.correctedBalanceAmount || 0;
  const multa = saldo * 0.02;
  const juros = (saldo + multa) * 0.01 * (dias / 30);
  return multa + juros;
}

function daysOverdue(dueDate: string): number {
  if (!dueDate) return 0;
  const due = new Date(dueDate + "T00:00:00");
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  return Math.floor((hoje.getTime() - due.getTime()) / 86400000);
}

const SectionHeader = ({ children }: { children: React.ReactNode }) => (
  <h3 className="text-[11px] font-bold uppercase tracking-widest text-blue-700 dark:text-blue-300 mb-3 px-3 py-1.5 bg-blue-50 dark:bg-blue-950/40 border-l-[3px] border-blue-500 dark:border-blue-400 rounded-r-md">
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
  <div className={`flex items-center justify-between gap-3 py-1.5 px-2 rounded ${highlight ? "bg-blue-50 dark:bg-blue-950/30" : ""}`}>
    <span className={`text-xs ${highlight ? "font-bold text-blue-700 dark:text-blue-300" : "text-slate-500 dark:text-slate-400"}`}>{label}</span>
    <span className={`text-xs tabular-nums ${highlight ? "font-bold text-blue-700 dark:text-blue-300" : "font-medium text-slate-800 dark:text-slate-200"}`}>
      {formatCurrency(value)}
    </span>
  </div>
);

export function PaymentDetailModal({ item, open, onClose }: Props) {
  if (!item) return null;

  const aberto = effectiveOpenAmount(item, false);
  const encargos = calcEncargos(item);
  const vencido = encargos > 0;
  const overdue = daysOverdue(item.dueDate);
  const cats = item.paymentsCategories || [];
  const buildings = item.buildingsCosts || [];
  const payments = item.payments || [];

  const totalPago = payments.reduce((s, p) => s + (p.netAmount || 0), 0);
  const paymentsSorted = [...payments].sort((a, b) => (b.paymentDate || "").localeCompare(a.paymentDate || ""));

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto p-0 gap-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-slate-200 dark:border-slate-700">
          <DialogTitle className="text-base font-bold text-slate-800 dark:text-slate-100">
            {item.creditorName || "(sem credor)"}
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
              <KV
                label="Vencimento"
                value={
                  <span className={overdue > 0 ? "text-red-600 dark:text-red-300/80 font-semibold" : ""}>
                    {formatDate(item.dueDate)}
                    {overdue > 0 && <span className="ml-1 text-[10px]">({overdue}d atraso)</span>}
                  </span>
                }
              />
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
                <Badge variant="outline" className="text-[10px] border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-300">
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
              {(item.taxAmount || 0) > 0 && <MoneyKV label="Imposto retido" value={item.taxAmount} />}
            </div>
            <div className="mt-2 space-y-1">
              <MoneyKV label="Valor em aberto" value={aberto} highlight />
              {vencido && (
                <>
                  <MoneyKV label={`Encargos estimados (multa 2% + juros 1% a.m.)`} value={encargos} />
                  <MoneyKV label="Total com encargos" value={aberto + encargos} highlight />
                </>
              )}
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

          {/* SEÇÃO 4: Empreendimentos / Unidades */}
          {buildings.length > 0 && (
            <section>
              <SectionHeader>Empreendimentos / Unidades</SectionHeader>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700">
                      <th className="text-left font-semibold py-1.5 px-2">Empreendimento</th>
                      <th className="text-left font-semibold py-1.5 px-2">Unidade</th>
                      <th className="text-left font-semibold py-1.5 px-2">Planilha de Custos</th>
                      <th className="text-right font-semibold py-1.5 px-2 w-20">Rateio</th>
                    </tr>
                  </thead>
                  <tbody>
                    {buildings.map((b, i) => (
                      <tr key={i} className="border-b border-slate-100 dark:border-slate-800 last:border-b-0">
                        <td className="py-1.5 px-2 text-slate-700 dark:text-slate-300">{b.buildingName || "-"}</td>
                        <td className="py-1.5 px-2 text-slate-700 dark:text-slate-300">{b.buildingUnitName || "-"}</td>
                        <td className="py-1.5 px-2">
                          {b.costEstimationSheetName ? (
                            <span className="text-slate-700 dark:text-slate-300">{b.costEstimationSheetName}</span>
                          ) : (
                            <Badge variant="outline" className="text-[10px] border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
                              Sem orçamento
                            </Badge>
                          )}
                        </td>
                        <td className="py-1.5 px-2 text-right tabular-nums text-slate-700 dark:text-slate-300">
                          {(b.rate ?? 100).toFixed(0)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* SEÇÃO 5: Pagamentos Realizados */}
          {paymentsSorted.length > 0 && (
            <section>
              <SectionHeader>Pagamentos Realizados</SectionHeader>
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
                        Total Líquido Pago
                      </td>
                      <td className={`py-2 px-2 text-right tabular-nums font-bold ${totalPago < 0 ? "text-red-600 dark:text-red-300/80" : "text-slate-800 dark:text-slate-200"}`}>
                        {formatCurrency(totalPago)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </section>
          )}

          {/* SEÇÃO 6: Observação */}
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
