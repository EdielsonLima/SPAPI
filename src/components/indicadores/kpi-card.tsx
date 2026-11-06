import { cn } from "@/lib/utils";

type Tone = "default" | "accent" | "success" | "warning" | "danger";

/** Padrão Silva Packer: o card é sempre branco com borda fina; a cor semântica
 *  fica só no ponto antes do rótulo e, no caso negativo, na cor do valor. */
const TONE_DOT: Record<Tone, string> = {
  default: "bg-slate-300 dark:bg-slate-600",
  accent: "bg-blue-500",
  success: "bg-emerald-500",
  warning: "bg-amber-500",
  danger: "bg-red-500",
};

const TONE_VALUE: Record<Tone, string> = {
  default: "text-slate-900 dark:text-slate-50",
  accent: "text-slate-900 dark:text-slate-50",
  success: "text-slate-900 dark:text-slate-50",
  warning: "text-slate-900 dark:text-slate-50",
  danger: "text-red-600 dark:text-red-300/80",
};

export function KpiCard({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: Tone;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-3 min-w-0">
      <div className="flex items-center gap-1.5 min-w-0">
        <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", TONE_DOT[tone])} />
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
          {label}
        </p>
      </div>
      <p
        className={cn(
          "mt-1.5 text-2xl font-semibold tabular-nums whitespace-nowrap leading-tight",
          TONE_VALUE[tone]
        )}
      >
        {value}
      </p>
      {hint && (
        <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">{hint}</p>
      )}
    </div>
  );
}
