// Situação comercial da unidade no Quadro Espelho — mesma ideia do Financeiro
// da Leven (situacao-unidade.ts de lá), sem a classificação manual de contrato
// (Investidor / Permuta de serviço), que a Silva Packer não usa.
//
// O Sienge diz o estoque (Vendida, Disponível, Reserva Técnica, Proposta,
// Vendido/Terceiros). O painel acrescenta só uma leitura: unidade vendida num
// contrato todo em permuta (condição PE, `ehPermuta`) é Permutante.
// Uma regra só para o Quadro (Torre e Grade) e, depois, para a maquete 3D.

export type Situacao = "Vendido" | "Disponível" | "Permutante" | "Reservado" | "Proposta" | "Vendido/Terceiros";

// Ordem da legenda e cor de cada situação (hex, para gráfico e 3D; as classes
// Tailwind ficam na tela, porque src/lib não entra no content do Tailwind).
export const SITUACOES: { nome: Situacao; cor: string }[] = [
  { nome: "Vendido", cor: "#ef4444" },           // vermelho
  { nome: "Disponível", cor: "#10b981" },        // verde
  { nome: "Permutante", cor: "#8b5cf6" },        // roxo
  { nome: "Reservado", cor: "#eab308" },         // amarelo
  { nome: "Proposta", cor: "#94a3b8" },          // cinza
  { nome: "Vendido/Terceiros", cor: "#ec4899" }, // rosa
];
export const COR_SITUACAO: Record<string, string> = Object.fromEntries(SITUACOES.map(s => [s.nome, s.cor]));

// Situação a partir do estoque do Sienge e de o contrato ativo ser permuta pura.
// Proposta continua Proposta mesmo em contrato de permuta — a cor só muda
// quando a venda é emitida.
export function situacaoDaUnidade(statusSienge: string, permuta: boolean): Situacao | string {
  switch (statusSienge) {
    case "Disponível": return "Disponível";
    case "Reserva Técnica":
    case "Reservada": return "Reservado";
    case "Proposta": return "Proposta";
    case "Vendida": return permuta ? "Permutante" : "Vendido";
    case "Vendido/Terceiros": return "Vendido/Terceiros";
    default: return statusSienge; // outros estoques ficam com o nome do Sienge
  }
}

// Conta como vendida no Quadro (cartão "Vendidas", "% vendido", VGV): o mesmo
// conjunto do estoque "Vendida" de antes, agora dividido em Vendido e Permutante.
export const ehVendida = (s: string) => s === "Vendido" || s === "Permutante";
