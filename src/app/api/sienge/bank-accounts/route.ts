import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { siengeGet } from "@/lib/sienge";
import { getCachedDailyBalance, cacheDailyBalance } from "@/lib/db";
import pool from "@/lib/db";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type R = any;

// Mapping: accountNumber → bankName (from Power BI DimBanco)
const BANK_NAMES: Record<string, string> = {
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

// Accounts that are only valid for specific companies (companyId)
// CAIXA exists in all companies but only Silva Packer (companyId=1) should be in DimBanco
const COMPANY_RESTRICTED_ACCOUNTS: Record<string, number> = {
  "CAIXA": 1, // Only Silva Packer
};

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
      const month = monthParam || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      const [yearStr, monthStr] = month.split("-");
      const year = parseInt(yearStr);
      const mon = parseInt(monthStr);
      const lastDay = Math.min(new Date(year, mon, 0).getDate(), now.getFullYear() === year && now.getMonth() + 1 === mon ? now.getDate() : 31);

      // Generate dates
      const dates: string[] = [];
      for (let d = 1; d <= lastDay; d++) {
        dates.push(`${yearStr}-${monthStr}-${String(d).padStart(2, "0")}`);
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
            dailyBalances[date] = mapped;
            // Cache past days permanently (today's balance may still change)
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

    // Fill in missing DimBanco accounts from the most recent cached day
    const seenAccountKeys = new Set(allAccounts.map((a: R) => `${a.companyId}:${a.accountNumber}`));
    const dimBancoKeys = Object.keys(BANK_NAMES).flatMap(accNum => {
      // Find which companies have this account from past data
      return companyIds.map(cid => ({ companyId: cid, accountNumber: accNum, key: `${cid}:${accNum}` }));
    });
    const missingDimBanco = dimBancoKeys.filter(dk => BANK_NAMES[dk.accountNumber] && !seenAccountKeys.has(dk.key));

    if (missingDimBanco.length > 0) {
      // Try to find last known balances from cached_daily_balances
      try {
        const { rows } = await pool.query(
          `SELECT data FROM cached_daily_balances WHERE balance_date < $1 ORDER BY balance_date DESC LIMIT 1`,
          [today]
        );
        if (rows.length > 0) {
          const cachedDay = rows[0].data as { accountId: string; amount: number }[];
          for (const missing of missingDimBanco) {
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
              console.log(`[accounts-balances] Filled missing ${missing.key} from cache: ${cached.amount}`);
            }
          }
        }
      } catch (err) {
        console.log("[accounts-balances] Could not fill from cache:", err);
      }
    }

    const enriched = mapAccounts(allAccounts);

    return NextResponse.json({ data: enriched });
  } catch (error) {
    console.error("Error fetching accounts-balances:", error);
    return NextResponse.json({ error: "Failed to fetch account balances", details: String(error) }, { status: 500 });
  }
}
