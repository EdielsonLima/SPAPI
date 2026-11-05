"use client";

import { useEffect } from "react";

const INTERVALO_MS = 60_000;

/**
 * Enquanto a pessoa está logada com o sistema aberto, avisa a cada minuto, inclusive em segundo
 * plano. O servidor repassa o aviso ao Portal Silva Packer (tela de Uso).
 */
export function PresencaPortal() {
  useEffect(() => {
    const avisar = () => {
      fetch("/api/presenca-portal", { method: "POST" }).catch(() => {});
    };
    const aoVoltar = () => {
      if (document.visibilityState === "visible") avisar();
    };

    avisar();
    const timer = setInterval(avisar, INTERVALO_MS);
    document.addEventListener("visibilitychange", aoVoltar);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", aoVoltar);
    };
  }, []);

  return null;
}
