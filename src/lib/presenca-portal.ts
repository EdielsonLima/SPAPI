/**
 * Avisa o Portal Silva Packer de que esta pessoa está logada e com o sistema aberto, para a
 * tela de Uso do Portal. Falha nunca atrapalha o sistema. Sem as três variáveis, não faz nada.
 */
export async function avisarPresencaPortal(email: string | null | undefined): Promise<void> {
  const url = process.env.PORTAL_PRESENCA_URL;
  const token = process.env.PORTAL_PRESENCA_TOKEN;
  const origem = process.env.PORTAL_PRESENCA_ORIGEM;
  if (!url || !token || !origem || !email) return;

  try {
    const resposta = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ origem, email }),
      signal: AbortSignal.timeout(3000),
    });
    if (!resposta.ok) console.warn("[presenca] Portal respondeu", resposta.status);
  } catch (err) {
    console.warn("[presenca] sem resposta do Portal", err instanceof Error ? err.message : err);
  }
}
