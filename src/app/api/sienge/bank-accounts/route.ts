import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { siengeGet } from "@/lib/sienge";
import { getCachedDailyBalance, cacheDailyBalance } from "@/lib/db";
import pool from "@/lib/db";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type R = any;

// Mapping: accountNumber → bankName (DimBanco).
// Lista canônica das contas bancárias que DEVEM aparecer na tela de Saldos —
// validada 2026-08-06 contra a relação de saldos da Cátia (Silva Packer).
// São exatamente estas 17 contas (nada de Cash/COFRE/aplicações internas/XP zerado).
// Ao alterar, manter em sincronia com src/lib/dimBanco.ts. Números conferidos
// contra o que o Sienge /accounts-balances realmente devolve (ex.: Caixa CC Sul
// Brasil é "5791519180" sem hífen; aplicações vêm com prefixo "A").
const BANK_NAMES: Record<string, string> = {
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

// Exact mapping: accountNumber → companyId (dono da conta no Sienge).
// O companyId TEM que casar com o que o /accounts-balances devolve, senão o
// preenchimento por cache não resolve. Ex.: as duas contas BTG são do companyId 1
// (Silva Packer) no Sienge, mesmo a Cátia listando-as sob "Sul Brasil".
const DIMBAN_ACCOUNT_COMPANY: Record<string, number> = {
  // Silva Packer
  "0257918-9": 1,   // Banco Bradesco
  "275226-3": 1,    // Banco do Brasil
  "00483730-8": 1,  // BTG Pactual - CH
  "00910779-3": 1,  // BTG Pactual - JP
  // Sul Brasil
  "0241711-1": 3,   // Banco Bradesco
  "A0241711-1": 3,  // Aplicação Bradesco
  "5370-8": 3,      // Banco do Brasil
  "5791519180": 3,  // Caixa Econômica (Conta Corrente)
  "A5026-3": 3,     // Aplicação Caixa
  // Empreendimentos
  "490-1": 4,       // Edifício 135 Jardins
  "274-7": 5,       // Solar di Capri
  "479-0": 6,       // Palacio Elizabeth
  "487-1": 7,       // Residencial Hannover
  "277-1": 8,       // Solar di Siena
  "276-3": 9,       // Tesla Residencial
  "924-5": 10,      // Serenity
  "1241-6": 11,     // Rozza
};

// Contas válidas só para empresas específicas. Vazio: os 17 números acima são
// únicos por empresa (não há mais a conta genérica "CAIXA" compartilhada).
const COMPANY_RESTRICTED_ACCOUNTS: Record<string, number> = {};

function isInDimBanco(accountNumber: string, companyId: number): boolean {
  if (!BANK_NAMES[accountNumber]) return false;
  const restriction = COMPANY_RESTRICTED_ACCOUNTS[accountNumber];
  if (restriction !== undefined && restriction !== companyId) return false;
  return true;
}

// Helper: fetch all accounts for a single date
async function fetchBalancesForDate(date: string, companiesMap: Record<number, string>, companyIds: number[]): Promise<R[]> {
  const allAccounts: R[] = [];
  const firstPage = await siengeGet<R>("/accounts-balances", { balanceDate: date, offset: "0", limit: "200" });
  const results = firstPage?.results || [];
  const total = firstPage?.resultSetMetadata?.count || results.length;
  allAccounts.push(...results);
  console.log(`[accounts-balances] ${date}: got ${results.length} of ${total} accounts`);
  let offset = results.length;
  while (offset < total) {
    const page = await siengeGet<R>("/accounts-balances", { balanceDate: date, offset: String(offset), limit: "200" });
    const pr = page?.results || [];
    if (pr.length === 0) break;
    allAccounts.push(...pr);
    offset += pr.length;
  }
  // Fetch missing companies
  const seenCompanies = new Set(allAccounts.map((a: R) => a.companyId));
  const missing = companyIds.filter(id => !seenCompanies.has(id));
  if (missing.length > 0) {
    console.log(`[accounts-balances] Missing companies for ${date}: ${missing.join(",")}`);
  }
  for (const compId of missing) {
    try {
      const cp = await siengeGet<R>("/accounts-balances", { balanceDate: date, companyId: String(compId), offset: "0", limit: "100" });
      const cpResults = cp?.results || [];
      if (cpResults.length > 0) {
        console.log(`[accounts-balances] Found ${cpResults.length} accounts for company ${compId} on ${date}`);
        allAccounts.push(...cpResults);
      }
    } catch (err) {
      console.log(`[accounts-balances] Error fetching company ${compId} on ${date}: ${err}`);
    }
  }
  return allAccounts;
}

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const daily = searchParams.get("daily") === "true";
  const monthParam = searchParams.get("month"); // format: "2026-03"

  try {
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

    // 1. Fetch companies first
    const companiesMap: Record<number, string> = {};
    const companyIds: number[] = [];
    try {
      const cd = await siengeGet<R>("/companies", { offset: "0", limit: "100" });
      (cd?.results || []).forEach((c: R) => {
        companiesMap[c.id] = c.name;
        companyIds.push(c.id);
      });
    } catch { /* ignore */ }

    // Helper to map raw accounts to enriched structure
    const mapAccounts = (raw: R[]) => {
      return raw.map((acc: R) => {
        const accNum = acc.accountNumber || "";
        const compId = acc.companyId || 0;
        return {
          bankAccountId: `${compId}:${accNum}`,
          bankAccountDescription: accNum,
          bankCode: "",
          bankName: BANK_NAMES[accNum] || "",
          agencyNumber: "",
          accountNumber: accNum,
          companyId: compId,
          companyName: companiesMap[compId] || `Empresa ${compId}`,
          currentBalance: acc.amount ?? 0,
          reconciledAmount: acc.reconciledAmount ?? 0,
          accountStatus: acc.accountStatus || "",
          isInDimBanco: isInDimBanco(accNum, compId),
        };
      });
    }

    // ── DAILY BALANCES MODE ──
    if (daily) {
      const dates: string[] = [];

      if (monthParam === "last7") {
        // Last 7 calendar days
        for (let d = 6; d >= 0; d--) {
          const dt = new Date(now.getTime() - d * 86400000);
          dates.push(`${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`);
        }
      } else {
        const month = monthParam || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
        const [yearStr, monthStr] = month.split("-");
        const year = parseInt(yearStr);
        const mon = parseInt(monthStr);
        const lastDay = Math.min(new Date(year, mon, 0).getDate(), now.getFullYear() === year && now.getMonth() + 1 === mon ? now.getDate() : 31);
        for (let d = 1; d <= lastDay; d++) {
          dates.push(`${yearStr}-${monthStr}-${String(d).padStart(2, "0")}`);
        }
      }

      // Fetch with DB cache — past days from cache, today from API
      const dailyBalances: Record<string, { accountId: string; amount: number }[]> = {};
      const datesToFetch: string[] = [];

      // Check DB cache for past days
      for (const date of dates) {
        if (date < today) {
          const cached = await getCachedDailyBalance(date);
          if (cached) {
            dailyBalances[date] = cached as { accountId: string; amount: number }[];
            continue;
          }
        }
        datesToFetch.push(date);
      }

      console.log(`[daily-balances] ${dates.length - datesToFetch.length} from cache, ${datesToFetch.length} to fetch from API`);

      // All expected DimBanco account keys
      const expectedKeys = Object.entries(DIMBAN_ACCOUNT_COMPANY).map(([accNum, compId]) => `${compId}:${accNum}`);

      // Load last known balances from DB as fallback for missing accounts
      const lastKnownBalances: Record<string, number> = {};
      try {
        const { rows } = await pool.query(
          `SELECT data FROM cached_daily_balances ORDER BY balance_date DESC LIMIT 1`
        );
        if (rows.length > 0) {
          for (const entry of rows[0].data as { accountId: string; amount: number }[]) {
            lastKnownBalances[entry.accountId] = entry.amount;
          }
        }
      } catch { /* ignore */ }

      // Fetch remaining dates in batches of 3
      for (let i = 0; i < datesToFetch.length; i += 3) {
        const batch = datesToFetch.slice(i, i + 3);
        const promises = batch.map(async (date) => {
          try {
            const raw = await fetchBalancesForDate(date, companiesMap, companyIds);
            const mapped = raw.map((a: R) => ({
              accountId: `${a.companyId}:${a.accountNumber}`,
              amount: a.amount ?? 0,
            }));
            // Fill missing DimBanco accounts with last known value
            const seenKeys = new Set(mapped.map(m => m.accountId));
            for (const ek of expectedKeys) {
              if (!seenKeys.has(ek)) {
                // Try: 1) previous day in current fetch, 2) DB cache fallback
                let prevAmount = lastKnownBalances[ek] ?? 0;
                const prevDates = Object.keys(dailyBalances).sort().reverse();
                for (const pd of prevDates) {
                  const prev = dailyBalances[pd]?.find(d => d.accountId === ek);
                  if (prev) { prevAmount = prev.amount; break; }
                }
                mapped.push({ accountId: ek, amount: prevAmount });
              }
            }
            // Update lastKnownBalances for next day's reference
            for (const m of mapped) { lastKnownBalances[m.accountId] = m.amount; }
            dailyBalances[date] = mapped;
            if (date < today) {
              await cacheDailyBalance(date, mapped);
            }
          } catch {
            dailyBalances[date] = [];
          }
        });
        await Promise.all(promises);
      }

      return NextResponse.json({ dailyBalances });
    }

    // ── STANDARD MODE (today's balances) ──
    const allAccounts = await fetchBalancesForDate(today, companiesMap, companyIds);

    // Fill in missing DimBanco accounts using exact account→company mapping
    const seenAccountKeys = new Set(allAccounts.map((a: R) => `${a.companyId}:${a.accountNumber}`));
    const expectedAccounts = Object.entries(DIMBAN_ACCOUNT_COMPANY).map(([accNum, compId]) => ({
      accountNumber: accNum, companyId: compId, key: `${compId}:${accNum}`
    }));
    const missingAccounts = expectedAccounts.filter(ea => !seenAccountKeys.has(ea.key));

    if (missingAccounts.length > 0) {
      console.log(`[accounts-balances] Missing DimBanco accounts: ${missingAccounts.map(m => m.key).join(", ")}`);

      // Try cache — search multiple recent days to find each missing account
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      try {
        const { rows } = await pool.query(
          `SELECT balance_date, data FROM cached_daily_balances ORDER BY balance_date DESC LIMIT 10`
        );
        const stillNeeded = new Set(missingAccounts.map(m => m.key));
        for (const row of rows) {
          if (stillNeeded.size === 0) break;
          const cachedDay = row.data as { accountId: string; amount: number }[];
          for (const missing of missingAccounts) {
            if (!stillNeeded.has(missing.key)) continue;
            const cached = cachedDay.find(c => c.accountId === missing.key);
            if (cached && cached.amount !== 0) {
              allAccounts.push({
                accountNumber: missing.accountNumber,
                companyId: missing.companyId,
                amount: cached.amount,
                reconciledAmount: 0,
                accountStatus: "ENABLED",
                links: [],
              });
              stillNeeded.delete(missing.key);
              console.log(`[accounts-balances] Filled ${missing.key} = ${cached.amount} from cache (${row.balance_date})`);
            }
          }
        }
      } catch (err) {
        console.log("[accounts-balances] Cache lookup error:", err);
      }

      // For any still missing (not in cache either), add with balance 0
      const stillMissing = missingAccounts.filter(m => !allAccounts.some((a: R) => `${a.companyId}:${a.accountNumber}` === m.key));
      for (const m of stillMissing) {
        allAccounts.push({
          accountNumber: m.accountNumber,
          companyId: m.companyId,
          amount: 0,
          reconciledAmount: 0,
          accountStatus: "ENABLED",
          links: [],
        });
        console.log(`[accounts-balances] Added missing ${m.key} with balance 0 (no cache available)`);
      }
    }

    const enriched = mapAccounts(allAccounts);

    return NextResponse.json({ data: enriched });
  } catch (error) {
    console.error("Error fetching accounts-balances:", error);
    return NextResponse.json({ error: "Failed to fetch account balances", details: String(error) }, { status: 500 });
  }
}
