"use client";

import React from "react";
import { Input } from "@/components/ui/input";
import { mascararValorBR, completarCentavosBR } from "@/lib/tabela-precos";

// Campo de valor em reais: "R$" fixo à esquerda, separador de milhar enquanto
// digita e centavos completados ao sair. O cursor fica depois do mesmo dígito
// em que estava — sem isso, cada ponto inserido o jogaria para o fim.
// Usado na Tabela de Preços e no modal Estoque do Resumo.
export function InputReais({ value, onChange, permitirNegativo = false, className = "", ...resto }: {
  value: string; onChange: (texto: string) => void; permitirNegativo?: boolean; className?: string;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  return (
    <div className={`relative ${className}`}>
      <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">R$</span>
      <Input
        {...resto}
        inputMode="decimal"
        value={value}
        className="h-full w-full pl-8 text-right tabular-nums"
        onChange={e => {
          const el = e.target;
          const cursor = el.selectionStart ?? el.value.length;
          const antes = el.value.slice(0, cursor);
          const digitosAntes = antes.replace(/[^\d,]/g, "").length;
          const novo = mascararValorBR(el.value, permitirNegativo);
          onChange(novo);
          requestAnimationFrame(() => {
            let pos = 0, vistos = 0;
            const inicio = novo.startsWith("-") && antes.trim().startsWith("-") ? 1 : 0;
            pos = inicio;
            while (pos < novo.length && vistos < digitosAntes) { if (/[\d,]/.test(novo[pos])) vistos++; pos++; }
            try { el.setSelectionRange(pos, pos); } catch { /* campo já desmontado */ }
          });
        }}
        onBlur={e => { const c = completarCentavosBR(value, permitirNegativo); if (c !== value) onChange(c); resto.onBlur?.(e); }}
      />
    </div>
  );
}
