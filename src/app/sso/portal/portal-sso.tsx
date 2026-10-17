"use client";

import { useEffect, useRef, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

const MENSAGENS: Record<string, string> = {
  "sem-cadastro":
    "Seu usuário do Portal ainda não tem cadastro no Financeiro. Peça acesso ao administrador.",
  "bilhete-invalido":
    "O link de acesso expirou ou já foi usado. Volte ao Portal e clique no card de novo.",
};

export function PortalSso({ token }: { token: string }) {
  const router = useRouter();
  const [erro, setErro] = useState("");
  // O bilhete é de uso único: em dev o React roda o efeito duas vezes.
  const enviado = useRef(false);

  useEffect(() => {
    if (enviado.current) return;
    enviado.current = true;
    window.history.replaceState(null, "", "/sso/portal");

    if (!token) {
      setErro(MENSAGENS["bilhete-invalido"]);
      return;
    }
    signIn("portal", { token, redirect: false })
      .then((r) => {
        if (r?.ok && !r.error) router.replace("/dashboard");
        else setErro(MENSAGENS[r?.error ?? ""] ?? MENSAGENS["bilhete-invalido"]);
      })
      .catch(() => setErro("Erro de conexão. Tente novamente pelo Portal."));
  }, [token, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-red-950 to-slate-900 p-4">
      <div className="w-full max-w-md rounded-xl bg-white/95 p-8 text-center shadow-2xl">
        {erro ? (
          <>
            <p className="text-slate-800">{erro}</p>
            <a href="/login" className="mt-6 inline-block text-sm text-red-700 underline">
              Entrar com usuário e senha
            </a>
          </>
        ) : (
          <div className="flex items-center justify-center gap-3 text-slate-700">
            <Loader2 className="h-5 w-5 animate-spin" />
            Entrando pelo Portal…
          </div>
        )}
      </div>
    </div>
  );
}
