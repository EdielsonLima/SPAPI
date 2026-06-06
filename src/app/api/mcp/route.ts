// Endpoint MCP sobre HTTP (Streamable HTTP — resposta application/json) para o
// conector do Cowork. JSON-RPC 2.0: initialize, tools/list, tools/call, ping.
// Auth por token: header x-api-token / Authorization: Bearer, ou ?k= na URL
// (== process.env.MCP_API_TOKEN). Reaproveita src/lib/financeiroActions.ts.
//
// Mesmo padrao do conector silvapacker-apropriacao (app de metas).
import { NextRequest, NextResponse } from "next/server";
import {
  resumoContasPagar,
  resumoContasReceber,
  inadimplenciaDetalhe,
  pagasRecebidasDia,
  saldosBancarios,
  dreResumo,
  indicadoresResumo,
  listarEmpresas,
} from "@/lib/financeiroActions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

const PROTOCOL = "2024-11-05";

function authorized(req: NextRequest): boolean {
  const expected = process.env.MCP_API_TOKEN || "";
  if (!expected) return false;
  const hdr = req.headers.get("x-api-token") || "";
  const bearer = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const q = req.nextUrl.searchParams.get("k") || "";
  return hdr === expected || bearer === expected || q === expected;
}

const TOOLS = [
  {
    name: "resumo_contas_pagar",
    fn: resumoContasPagar,
    description:
      "Resumo de Contas a Pagar da Silva Packer (mesma regra do Painel: a pagar = saldo aberto com vencimento >= hoje; vencidas = saldo aberto vencido). Totais gerais e por empresa. Exclui PREVISAO e Holding/Administradora. Params: 'empresa' (filtra por nome, ex.: DOMUS), 'agruparPorCredor' (top 30 credores), 'de'/'ate' (janela de VENCIMENTO, DD/MM/YYYY ou YYYY-MM-DD — ex.: contas de amanha = de e ate iguais a amanha), 'detalhar' (lista as parcelas: credor, empresa, titulo, vencimento, valor), 'limit' (parcelas listadas, default 100).",
    inputSchema: { type: "object", properties: { empresa: { type: "string" }, agruparPorCredor: { type: "boolean" }, de: { type: "string" }, ate: { type: "string" }, detalhar: { type: "boolean" }, limit: { type: "integer" } } },
  },
  {
    name: "resumo_contas_receber",
    fn: resumoContasReceber,
    description:
      "Resumo de Contas a Receber: a receber (saldo aberto) e inadimplencia (aberto vencido), totais e por empresa. Params: 'empresa' (filtra por nome), 'agruparPorCliente' (top 30 clientes), 'de'/'ate' (janela de VENCIMENTO, DD/MM/YYYY ou YYYY-MM-DD — ex.: recebimentos de amanha), 'detalhar' (lista as parcelas: cliente, empresa, titulo, vencimento, valor), 'limit' (default 100).",
    inputSchema: { type: "object", properties: { empresa: { type: "string" }, agruparPorCliente: { type: "boolean" }, de: { type: "string" }, ate: { type: "string" }, detalhar: { type: "boolean" }, limit: { type: "integer" } } },
  },
  {
    name: "inadimplencia_detalhe",
    fn: inadimplenciaDetalhe,
    description:
      "Detalha a INADIMPLENCIA (parcelas de contas a receber vencidas e em aberto): cliente, empresa, titulo/parcela, vencimento, DIAS DE ATRASO e valor. Agrupa por cliente (total, qtd, maior atraso) e lista as parcelas (maiores primeiro). Params: 'empresa' (filtra), 'cliente' (filtra por nome), 'minDias' (so atrasos >= N dias), 'limit' (parcelas listadas, default 100).",
    inputSchema: { type: "object", properties: { empresa: { type: "string" }, cliente: { type: "string" }, minDias: { type: "integer" }, limit: { type: "integer" } } },
  },
  {
    name: "pagas_recebidas_dia",
    fn: pagasRecebidasDia,
    description:
      "Contas PAGAS e RECEBIDAS (pagamentos/recebimentos efetivados) num dia ou periodo, com total, por empresa e liquido do dia. Regras validadas do Painel (netAmount; exclui PREVISAO e op types substituicao/cancelamento/abatimento/devolucao/por bens/permuta; recebidas = netAmount > 0). Params: 'dia' (default ONTEM), ou 'de'/'ate' (DD/MM/YYYY ou YYYY-MM-DD), 'empresa', 'detalhar' (lista lancamentos credor/cliente+valor), 'limit'. Retorna cacheAtualizadoEm — se anterior ao periodo, dados podem estar incompletos.",
    inputSchema: { type: "object", properties: { dia: { type: "string" }, de: { type: "string" }, ate: { type: "string" }, empresa: { type: "string" }, detalhar: { type: "boolean" }, limit: { type: "integer" } } },
  },
  {
    name: "saldos_bancarios",
    fn: saldosBancarios,
    description:
      "Saldos bancarios por empresa e conta no dia mais recente disponivel no cache (cached_daily_balances). Por padrao espelha o filtro de contas do Painel (oculta XP/Bradesco/Aplicacao/CEF da Silva Packer e XP/CEF da Sul Brasil — total bate com a tela). Params: 'empresa' (filtra por nome), 'todasContas' (true = inclui TODAS as contas DimBanco, sem o filtro do Painel).",
    inputSchema: { type: "object", properties: { empresa: { type: "string" }, todasContas: { type: "boolean" } } },
  },
  {
    name: "dre_resumo",
    fn: dreResumo,
    description:
      "DRE consolidada por categoria (receita, custo, lucro bruto/operacional/liquido etc.) de um ano. Todas as empresas exceto Holding (igual ao Painel/Power BI). Params: 'ano' (ex.: 2026; default ano atual); 'categoria' (drill-down: detalha a categoria por CONTA FINANCEIRA e por EMPRESA — aceita chave ou nome, ex.: 'despesas_tributarias', 'custo variavel', 'tributarias').",
    inputSchema: { type: "object", properties: { ano: { type: "string" }, categoria: { type: "string" } } },
  },
  {
    name: "indicadores",
    fn: indicadoresResumo,
    description: "Indicadores mais recentes: CUB (valor/m2, variacao mensal e anual) e valor por m2.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "listar_empresas",
    fn: listarEmpresas,
    description: "Lista as empresas/empreendimentos cadastrados (id, nome, status). Use para descobrir o nome correto a passar no filtro 'empresa'.",
    inputSchema: { type: "object", properties: {} },
  },
];

function rpcResult(id: unknown, result: unknown) { return { jsonrpc: "2.0", id, result }; }
function rpcError(id: unknown, code: number, message: string) { return { jsonrpc: "2.0", id, error: { code, message } }; }

async function handleMessage(msg: { id?: unknown; method?: string; params?: { name?: string; arguments?: unknown } } | null): Promise<unknown | null> {
  const id = msg?.id;
  const method = msg?.method;
  const params = msg?.params;
  switch (method) {
    case "initialize":
      return rpcResult(id, { protocolVersion: PROTOCOL, capabilities: { tools: {} }, serverInfo: { name: "silvapacker-financeiro", version: "0.2.0" } });
    case "notifications/initialized":
      return null;
    case "ping":
      return rpcResult(id, {});
    case "tools/list":
      return rpcResult(id, { tools: TOOLS.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })) });
    case "tools/call": {
      const name = params?.name;
      const args = (params?.arguments as Record<string, unknown>) || {};
      const tool = TOOLS.find((t) => t.name === name);
      if (!tool) return rpcError(id, -32602, `Ferramenta desconhecida: ${name}`);
      try {
        const out = await (tool.fn as (a: Record<string, unknown>) => Promise<unknown>)(args);
        return rpcResult(id, { content: [{ type: "text", text: JSON.stringify(out, null, 2) }] });
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return rpcResult(id, { content: [{ type: "text", text: `Erro: ${message}` }], isError: true });
      }
    }
    default:
      return id !== undefined && id !== null ? rpcError(id, -32601, `Metodo nao suportado: ${method}`) : null;
  }
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json(rpcError(null, -32001, "Unauthorized"), { status: 401 });
  const body = await req.json().catch(() => null);
  if (Array.isArray(body)) {
    const out = (await Promise.all(body.map(handleMessage))).filter((x) => x !== null);
    return NextResponse.json(out);
  }
  const res = await handleMessage(body);
  return NextResponse.json(res ?? {}, { status: res ? 200 : 202 });
}

export async function GET() {
  return NextResponse.json({ ok: true, server: "silvapacker-financeiro", protocol: PROTOCOL, tools: TOOLS.map((t) => t.name) });
}
