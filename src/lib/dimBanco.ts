// CÓPIA dos mapeamentos DimBanco de src/app/api/sienge/bank-accounts/route.ts.
// A rota é a FONTE DA VERDADE (protegida por regra "NÃO ALTERAR" no CLAUDE.md)
// e não pode exportar consts (restrição de exports de route handlers do Next).
// MANTER EM SINCRONIA ao alterar a rota.
//
// Usado pelo cron de refresh (cached_daily_balances) e pelo conector MCP
// (saldos_bancarios) para filtrar/nomear contas igual ao Painel.

// Lista canônica das 17 contas bancárias que DEVEM aparecer (validada 2026-08-06
// contra a relação da Cátia). MANTER EM SINCRONIA com route.ts.
export const BANK_NAMES: Record<string, string> = {
  // Silva Packer (companyId 1)
  "0257918-9": "Banco Bradesco",
  "275226-3": "Banco do Brasil",
  "00483730-8": "BTG Pactual - CH",
  "00910779-3": "BTG Pactual - JP",
  // Sul Brasil (companyId 3)
  "0241711-1": "Banco Bradesco",
  "A0241711-1": "Aplicação Bradesco",
  "5370-8": "Banco do Brasil",
  "5791519180": "Caixa Econômica",
  "A5026-3": "Aplicação Caixa",
  // Empreendimentos (Banco do Brasil)
  "490-1": "Banco do Brasil",   // Edifício 135 Jardins
  "274-7": "Banco do Brasil",   // Solar di Capri
  "479-0": "Banco do Brasil",   // Palacio Elizabeth
  "487-1": "Banco do Brasil",   // Residencial Hannover
  "277-1": "Banco do Brasil",   // Solar di Siena
  "276-3": "Banco do Brasil",   // Tesla Residencial
  "924-5": "Banco do Brasil",   // Serenity
  "1241-6": "Banco do Brasil",  // Rozza
};

export const DIMBAN_ACCOUNT_COMPANY: Record<string, number> = {
  // Silva Packer
  "0257918-9": 1,
  "275226-3": 1,
  "00483730-8": 1,
  "00910779-3": 1,
  // Sul Brasil
  "0241711-1": 3,
  "A0241711-1": 3,
  "5370-8": 3,
  "5791519180": 3,
  "A5026-3": 3,
  // Empreendimentos
  "490-1": 4,   // Edifício 135 Jardins
  "274-7": 5,   // Solar di Capri
  "479-0": 6,   // Palacio Elizabeth
  "487-1": 7,   // Residencial Hannover
  "277-1": 8,   // Solar di Siena
  "276-3": 9,   // Tesla Residencial
  "924-5": 10,  // Serenity
  "1241-6": 11, // Rozza
};

export const COMPANY_RESTRICTED_ACCOUNTS: Record<string, number> = {};

export function isInDimBanco(accountNumber: string, companyId: number): boolean {
  if (!BANK_NAMES[accountNumber]) return false;
  const restriction = COMPANY_RESTRICTED_ACCOUNTS[accountNumber];
  if (restriction !== undefined && restriction !== companyId) return false;
  return true;
}

// Chaves esperadas no cache diário ("companyId:accountNumber") — usadas para
// preencher contas que a API não retornou num dia (mesma lógica do Painel).
export function expectedDimBancoKeys(): string[] {
  return Object.entries(DIMBAN_ACCOUNT_COMPANY).map(([acc, compId]) => `${compId}:${acc}`);
}

// Contas ocultadas no relatório/conector MCP para bater com a tela de Saldos.
// Vazio desde 2026-08-06: a tela agora mostra EXATAMENTE a lista canônica da
// Cátia (as 17 contas de BANK_NAMES acima), então o relatório espelha a tela
// sem exclusões adicionais. As contas antes excluídas (Cash, XP zerado,
// aplicação/caixa internas da Silva Packer) saíram do próprio DIMBAN.
export const REPORT_EXCLUDED_ACCOUNTS = new Set<string>([]);
