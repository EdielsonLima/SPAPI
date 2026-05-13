import { cn } from "@/lib/utils";

type Tone = "default" | "accent" | "success" | "warning" | "danger";

const TONE_CLASSES: Record<Tone, string> = {
  default:
    "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900",
  accent:
    "border-blue-300 dark:border-blue-700/60 bg-blue-50/70 dark:bg-blue-950/30",
  success:
    "border-emerald-300 dark:border-emerald-700/60 bg-emerald-50/70 dark:bg-emerald-950/30",
  warning:
    "border-amber-300 dark:border-amber-700/60 bg-amber-50/70 dark:bg-amber-950/30",
  danger:
    "border-rose-300 dark:border-rose-700/60 bg-rose-50/70 dark:bg-rose-950/30",
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
    <div
      className={cn(
        "rounded-2xl border p-4 shadow-sm transition-colors",
        TONE_CLASSES[tone]
      )}
    >
      <p className="text-[0.7rem] uppercase tracking-widest text-slate-500 dark:text-slate-400 font-semibold">
        {label}
      </p>
      <p className="mt-1.5 text-2xl font-semibold tabular-nums text-slate-800 dark:text-slate-100">
        {value}
      </p>
      {hint && (
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{hint}</p>
      )}
    </div>
  );
}
