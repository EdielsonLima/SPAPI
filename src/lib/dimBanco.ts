// CÓPIA dos mapeamentos DimBanco de src/app/api/sienge/bank-accounts/route.ts.
// A rota é a FONTE DA VERDADE (protegida por regra "NÃO ALTERAR" no CLAUDE.md)
// e não pode exportar consts (restrição de exports de route handlers do Next).
// MANTER EM SINCRONIA ao alterar a rota.
//
// Usado pelo cron de refresh (cached_daily_balances) e pelo conector MCP
// (saldos_bancarios) para filtrar/nomear contas igual ao Painel.

export const BANK_NAMES: Record<string, string> = {
  "570920-2": "Banco XP",
  "A0257918-9": "Aplicação Bradesco",
  "275226-3": "Banco do Brasil",
  "0257918-9": "Banco Bradesco",
  "2261-8": "Caixa Econômica",
  "CAIXA": "Cash",
  "479-0": "Banco do Brasil",
  "490-1": "Banco do Brasil",
  "487-1": "Banco do Brasil",
  "274-7": "Banco do Brasil",
  "276-3": "Banco do Brasil",
  "277-1": "Banco do Brasil",
  "572226-0": "Banco XP",
  "5370-8": "Banco do Brasil",
  "5026-3": "Caixa Econômica",
  "0241711-1": "Banco Bradesco",
  "00483730-8": "BTG Pactual - CH",
  "00910779-3": "BTG Pactual - JP",
};

export const DIMBAN_ACCOUNT_COMPANY: Record<string, number> = {
  "00483730-8": 1,
  "00910779-3": 1,
  "0257918-9": 1,
  "A0257918-9": 1,
  "2261-8": 1,
  "CAIXA": 1,
  "275226-3": 1,
  "570920-2": 1,
  "0241711-1": 3,
  "5370-8": 3,
  "572226-0": 3,
  "5026-3": 3,
  "490-1": 4,
  "274-7": 5,
  "479-0": 6,
  "487-1": 7,
  "277-1": 8,
  "276-3": 9,
};

export const COMPANY_RESTRICTED_ACCOUNTS: Record<string, number> = {
  CAIXA: 1, // só Silva Packer
};

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

// Contas OCULTADAS no filtro do Painel do Edielson (localStorage do navegador,
// espelhadas aqui a pedido dele em 2026-06-06 para o conector/relatório bater
// com a tela — "12 contas em 8 empresas"). Se o filtro do Painel mudar,
// atualizar esta lista. Chave: "companyId:accountNumber".
export const REPORT_EXCLUDED_ACCOUNTS = new Set<string>([
  "1:570920-2",   // Banco XP — Silva Packer
  "1:0257918-9",  // Banco Bradesco — Silva Packer
  "1:A0257918-9", // Aplicação Bradesco — Silva Packer
  "1:2261-8",     // Caixa Econômica — Silva Packer
  "3:572226-0",   // Banco XP — Sul Brasil
  "3:5026-3",     // Caixa Econômica — Sul Brasil
]);
