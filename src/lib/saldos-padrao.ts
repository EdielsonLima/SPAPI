// "Resetar padrão" da aba Saldos: o que muda ao voltar às contas da relação canônica.
// Seleção vazia no painel quer dizer "todas as contas" (effectiveSelected), então
// a comparação é feita contra a seleção EFETIVA, não contra o conjunto cru.

export interface ResetContas {
  /** Contas que a seleção efetiva tem hoje. */
  atuais: number;
  /** Contas do padrão (as da relação, isInDimBanco). */
  padrao: number;
  /** Ids que passam a contar. */
  entram: string[];
  /** Ids que deixam de contar. */
  saem: string[];
  /** A seleção efetiva já é o padrão. */
  igualAoPadrao: boolean;
  /** O padrão salvo no navegador (Salvar padrão) é outro e será trocado. */
  trocaPadraoSalvo: boolean;
  /** Sem conta da relação carregada: resetar gravaria seleção vazia (= todas). */
  semPadrao: boolean;
}

export function resetContasSaldos(opts: {
  selecionadas: Iterable<string>;
  todas: Iterable<string>;
  padrao: Iterable<string>;
  /** Conteúdo cru de localStorage.dashboard_saldos_accounts_v2 (null = nada salvo). */
  salvo: string | null;
}): ResetContas {
  const todas = new Set(opts.todas);
  const padrao = new Set(opts.padrao);
  const marcadas = new Set(opts.selecionadas);
  // Id salvo que não existe mais na lista não aparece na tela: não conta.
  const efetivas = marcadas.size > 0 ? new Set(Array.from(marcadas).filter(id => todas.has(id))) : todas;

  const entram = Array.from(padrao).filter(id => !efetivas.has(id)).sort();
  const saem = Array.from(efetivas).filter(id => !padrao.has(id)).sort();

  let salvoIds: Set<string> | null = null;
  try {
    const lido = opts.salvo ? JSON.parse(opts.salvo) : null;
    if (Array.isArray(lido)) salvoIds = new Set(lido.map(String));
  } catch {
    salvoIds = null;
  }
  const salvoIgual =
    salvoIds === null ||
    (salvoIds.size === padrao.size && Array.from(padrao).every(id => salvoIds!.has(id)));

  return {
    atuais: efetivas.size,
    padrao: padrao.size,
    entram,
    saem,
    igualAoPadrao: padrao.size > 0 && entram.length === 0 && saem.length === 0,
    trocaPadraoSalvo: !salvoIgual,
    semPadrao: padrao.size === 0,
  };
}
