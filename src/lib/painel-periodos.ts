// Períodos que o Painel Executivo lê do cache do Sienge ao abrir. Uma fonte só
// para a tela (executive-dashboard.tsx), a rotina diária (refreshCache.ts) e o
// servidor que deixa o gzip pronto (cache-sienge-resposta.ts). Se divergirem, a
// rotina grava uma chave que o Painel não lê — foi o que aconteceu com o Contas
// a Receber até 09/11/2026 (rotina até 2031, Painel até 2041): o CR do Painel só
// se renovava no "Atualizar" ou quando o cache vencia (7 dias).
export function periodosDoPainel(ano = new Date().getFullYear()) {
  return {
    inicio: `${ano - 10}-01-01`,
    // Contas a Pagar e movimentos bancários
    fim: `${ano + 5}-12-31`,
    // Contas a Receber: financiamento direto vai longe (dueDate até 2034 na SP)
    fimReceber: `${ano + 15}-12-31`,
  };
}
