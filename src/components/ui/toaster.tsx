"use client";

import { Toaster as Sonner } from "sonner";

export function Toaster() {
  return (
    <Sonner
      position="top-right"
      toastOptions={{
        classNames: {
          toast: "bg-white border shadow-lg rounded-lg",
          title: "text-slate-800 font-medium text-sm",
          description: "text-slate-500 text-xs",
          error: "border-red-200 bg-red-50",
          success: "border-green-200 bg-green-50",
          warning: "border-amber-200 bg-amber-50",
        },
      }}
      richColors
      closeButton
    />
  );
}
