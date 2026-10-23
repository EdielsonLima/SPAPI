// Andamento da obra na maquete 3D (Edielson, 23/10: "as informações do site,
// para a apresentação ao cliente"). Fonte: a página do empreendimento no site
// da Silva Packer (seção "Andamento da obra"); se o site não responder ou a
// leitura não fechar, vale o que está gravado no painel (editável por quem
// edita a tabela de preços). Leitura duvidosa não entra: melhor o número
// gravado do que um número errado.

export interface EtapaObra { etapa: string; pct: number }
export interface AndamentoObra { etapas: EtapaObra[]; fonte: "site" | "painel"; atualizadoEm: string }

export const ETAPAS_OBRA = ["Projeto", "Fundação", "Estrutura", "Alvenaria", "Instalações", "Reboco", "Pintura", "Esquadrias", "Decoração"];

// Site em 23/10/2026 (print do Edielson): ponto de partida do painel.
export const ANDAMENTO_INICIAL: Record<string, EtapaObra[]> = {
  "palacio-elizabeth": [100, 100, 55, 15, 2, 2, 0, 0, 0].map((pct, i) => ({ etapa: ETAPAS_OBRA[i], pct })),
};

const sem = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().trim();

// Lê as etapas do HTML do site. Aceita o número como texto ("55%") ou como
// atributo do contador (data-to-value / data-percent / data-value), que é o
// que o WordPress grava antes da animação. Só aceita se achar TODAS as etapas,
// com 0–100, e nem todas zero (contador ainda não animado).
export function lerAndamentoDoHtml(html: string): EtapaObra[] | null {
  const ini = sem(html).indexOf("ANDAMENTO DA OBRA");
  if (ini < 0) return null;
  const trecho = html.slice(ini, ini + 60000);
  const achado = new Map<string, number>();
  // 1) Atributo numérico seguido do rótulo da etapa.
  const reAttr = /data-(?:to-value|percent|percentage|value|number)="(\d{1,3})(?:\.\d+)?"[\s\S]{0,1500}?>\s*([A-Za-zÀ-ú ]{4,20})\s*</g;
  // 2) Texto "55%" seguido do rótulo.
  const reTxt = />\s*(\d{1,3})\s*%\s*<[\s\S]{0,600}?>\s*([A-Za-zÀ-ú ]{4,20})\s*</g;
  for (const re of [reAttr, reTxt]) {
    for (const m of Array.from(trecho.matchAll(re))) {
      const etapa = ETAPAS_OBRA.find(e => sem(e) === sem(m[2]));
      const v = Number(m[1]);
      if (etapa && v >= 0 && v <= 100 && !achado.has(etapa)) achado.set(etapa, v);
    }
    if (achado.size === ETAPAS_OBRA.length) break;
  }
  if (achado.size !== ETAPAS_OBRA.length) return null;
  const etapas = ETAPAS_OBRA.map(etapa => ({ etapa, pct: achado.get(etapa)! }));
  return etapas.some(e => e.pct > 0) ? etapas : null;
}

export function etapasValidas(x: unknown): EtapaObra[] | null {
  if (!Array.isArray(x)) return null;
  const etapas = ETAPAS_OBRA.map(etapa => {
    const e = x.find(i => i && i.etapa === etapa);
    const pct = Math.round(Number(e?.pct));
    return Number.isFinite(pct) && pct >= 0 && pct <= 100 ? { etapa, pct } : null;
  });
  return etapas.every(Boolean) ? (etapas as EtapaObra[]) : null;
}
