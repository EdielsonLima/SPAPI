"use client";

// Aba "Fechamento de Caixa" do Painel Executivo (Edielson, 18/11/2026).
// O Carlos Humberto pede toda manhã o fechamento do dia anterior: a aba abre nele, macro
// (cinco cartões e uma tabela), e deixa abrir a empresa, a conta e o lançamento.
// Regras em src/lib/fechamento-caixa.ts; a rota /api/fechamento-caixa busca no Sienge na hora.
// Desde 19/11/2026 Entradas e Saídas são os títulos recebidos e pagos, iguais ao fechamento
// das 07:30, também os que passaram pelo caixa interno ou por conta da Holding; o resto
// do que mexe nos bancos fica em "Outros".
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Building2, CalendarDays, ChevronDown, ChevronLeft, ChevronRight, FileDown, Landmark, Loader2, RefreshCw, Search, X } from "lucide-react";
import { montarFechamentoHtml, nomeArquivoFechamento } from "@/lib/fechamento-html";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MultiSelectFilter } from "@/components/multi-select-filter";
import { formatCurrency } from "@/lib/dashboard-utils";
import {
  agruparLinhas,
  composicaoOutros,
  contarLancamentos,
  diaADia,
  resumoForaDosBancos,
  totalizar,
  type CategoriaOutro,
  type ComposicaoOutros,
  type FechamentoCaixa,
  type Lancamento,
  type LinhaConta,
  type TipoLancamento,
} from "@/lib/fechamento-caixa";
import {
  abrevDoDia,
  dataBr,
  dataValida,
  diaMes,
  diasNoPeriodo,
  ehDiaUtil,
  esteMes,
  fechamentoAnterior,
  fechamentoSeguinte,
  feriado,
  hojeEmBrasilia,
  janelaDoFechamento,
  mesPassado,
  mesmaJanela,
  rotuloDaJanela,
  semanaPassada,
  somarDias,
  type Janela,
} from "@/lib/dias-uteis";

type Visao = "empresa" | "banco" | "dias" | "lancamentos";
type Resposta = FechamentoCaixa & { erroAoAtualizar?: boolean };

const MAX_DIAS = 400;
/** Fechamento guardado há mais que isto é mostrado e renovado em segundo plano. */
const VELHO_MS = 60_000;
const LANCAMENTOS_POR_CONTA = 40;
const LANCAMENTOS_NA_LISTA = 400;
const CHAVE_VISAO = "dashboard_fechamento_agrupar";

// Memória da aba enquanto o Painel está aberto: voltar a ela mostra na hora o período em
// que estava e o último fechamento recebido.
const memoria: { dia: string; janela: Janela | null; dados: Map<string, FechamentoCaixa> } = { dia: "", janela: null, dados: new Map() };

const chaveDa = (j: Janela) => `${j.de}|${j.ate}`;
const reais = (v: number) => formatCurrency(v);
const comSinal = (v: number) => (v > 0 ? `+${formatCurrency(v)}` : formatCurrency(v));
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

const VERDE = "text-emerald-700 dark:text-emerald-400";
const VERMELHO = "text-[#c03f55] dark:text-rose-300";
const APAGADO = "text-slate-500 dark:text-slate-400";
const ROTULO_TIPO: Record<TipoLancamento, string> = { entrada: "Entrada", saida: "Saída", outro: "Outro" };
const ROTULO_CATEGORIA: Record<CategoriaOutro, string> = {
  transferencia: "Transferência",
  tarifa: "Tarifa bancária",
  holding: "Título da Holding",
  avulso: "Lançamento avulso",
};
const rotuloDoLancamento = (l: Lancamento) =>
  l.abate ? l.historico || "Abate" : l.tipo === "outro" ? ROTULO_CATEGORIA[l.categoria ?? "avulso"] : ROTULO_TIPO[l.tipo];
const DICA_OUTROS =
  "O que mexe no saldo dos bancos sem ser título das empresas (transferências, tarifas, título da Holding) e, com o sinal contrário, o que foi pago ou recebido fora dos bancos (caixa interno, conta da Holding): isso está em Entradas e Saídas, mas não passou pelas contas.";

/** De que é feita a coluna Outros, do maior para o menor. */
function partesDosOutros(c: ComposicaoOutros): { rotulo: string; valor: number }[] {
  return [
    { rotulo: "transferências", valor: c.transferencias },
    { rotulo: "tarifas", valor: c.tarifas },
    { rotulo: "títulos da Holding", valor: c.holding },
    { rotulo: "avulsos", valor: c.avulsos },
    { rotulo: "fora dos bancos", valor: c.foraDosBancos },
  ]
    .filter((p) => Math.abs(p.valor) > 0.005)
    .sort((a, b) => Math.abs(b.valor) - Math.abs(a.valor));
}

function lerVisaoSalva(): "empresa" | "banco" {
  try {
    return localStorage.getItem(CHAVE_VISAO) === "banco" ? "banco" : "empresa";
  } catch {
    return "empresa";
  }
}

function horaDaPosicao(geradoEm: string, hoje: string): string {
  const d = new Date(geradoEm);
  if (Number.isNaN(d.getTime())) return "";
  const hora = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
  const dia = hojeEmBrasilia(d);
  return dia === hoje ? `posição das ${hora}` : `posição de ${diaMes(dia)} às ${hora}`;
}

export function FechamentoCaixaTab() {
  const hoje = useMemo(() => hojeEmBrasilia(), []);
  const padrao = useMemo(() => janelaDoFechamento(hoje), [hoje]);
  if (memoria.dia !== hoje) {
    memoria.dia = hoje;
    memoria.janela = null;
    memoria.dados.clear();
  }

  const [janela, setJanelaEstado] = useState<Janela>(() => memoria.janela ?? padrao);
  const [dados, setDados] = useState<FechamentoCaixa | null>(() => memoria.dados.get(chaveDa(memoria.janela ?? padrao)) ?? null);
  const [carregando, setCarregando] = useState(false);
  const [atualizando, setAtualizando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [recarga, setRecarga] = useState(0);
  const forcar = useRef(false);

  const [visao, setVisao] = useState<Visao>("empresa");
  useEffect(() => setVisao(lerVisaoSalva()), []);
  const [abertos, setAbertos] = useState<Set<string>>(new Set());
  const [empresas, setEmpresas] = useState<Set<string>>(new Set());
  const [bancos, setBancos] = useState<Set<string>>(new Set());
  const [busca, setBusca] = useState("");
  const [tipoLista, setTipoLista] = useState<TipoLancamento | "todos">("todos");
  const [contaLista, setContaLista] = useState<string | null>(null);

  const [periodoAberto, setPeriodoAberto] = useState(false);
  const [deDigitado, setDeDigitado] = useState(janela.de);
  const [ateDigitado, setAteDigitado] = useState(janela.ate);

  const setJanela = useCallback((j: Janela) => {
    memoria.janela = j;
    setJanelaEstado(j);
    setAbertos(new Set());
    setContaLista(null);
    setBusca("");
  }, []);

  // Busca: mostra na hora o que já tem (memória da aba, depois a do servidor) e, se for
  // velho, pede de novo ao Sienge em segundo plano e troca.
  useEffect(() => {
    let vivo = true;
    const chave = chaveDa(janela);
    const pedir = async (fresco: boolean): Promise<Resposta> => {
      const r = await fetch(`/api/fechamento-caixa?de=${janela.de}&ate=${janela.ate}${fresco ? "&fresco=1" : ""}`, { cache: "no-store" });
      const corpo = await r.json().catch(() => null);
      if (!r.ok || !corpo) throw new Error(corpo?.error || "Não foi possível buscar o fechamento agora.");
      return corpo as Resposta;
    };
    const guardar = (d: Resposta) => {
      memoria.dados.set(chave, d);
      if (vivo) setDados(d);
    };
    (async () => {
      const querFresco = forcar.current;
      forcar.current = false;
      let atual = memoria.dados.get(chave) ?? null;
      setDados(atual);
      setErro(null);
      try {
        if (!atual) {
          setCarregando(true);
          atual = await pedir(false);
          guardar(atual);
          if (vivo) setCarregando(false);
        }
        if (querFresco || Date.now() - new Date(atual.geradoEm).getTime() > VELHO_MS) {
          if (vivo) setAtualizando(true);
          const novo = await pedir(true);
          guardar(novo);
          if (vivo && novo.erroAoAtualizar) toast.error("O Sienge não respondeu agora. Mostrando a última posição.");
        }
      } catch (e) {
        if (!vivo) return;
        if (atual) toast.error("O Sienge não respondeu agora. Mostrando a última posição.");
        else setErro(e instanceof Error ? e.message : "Não foi possível buscar o fechamento agora.");
      } finally {
        if (vivo) {
          setCarregando(false);
          setAtualizando(false);
        }
      }
    })();
    return () => {
      vivo = false;
    };
  }, [janela, recarga]);

  const umDia = janela.de === janela.ate;
  const visaoAtiva: Visao = visao === "dias" && umDia ? lerVisaoSalva() : visao;

  const trocarVisao = (v: Visao) => {
    setVisao(v);
    if (v === "empresa" || v === "banco") {
      try {
        localStorage.setItem(CHAVE_VISAO, v);
      } catch { /* sem armazenamento: vale só nesta visita */ }
    }
  };

  const todasEmpresas = useMemo(() => Array.from(new Set((dados?.linhas ?? []).map((l) => l.empresa))).sort(), [dados]);
  const todosBancos = useMemo(() => Array.from(new Set((dados?.linhas ?? []).map((l) => l.instituicao))).sort(), [dados]);
  const filtrado = empresas.size > 0 || bancos.size > 0;

  const linhas = useMemo(
    () => (dados?.linhas ?? []).filter((l) => (empresas.size === 0 || empresas.has(l.empresa)) && (bancos.size === 0 || bancos.has(l.instituicao))),
    [dados, empresas, bancos]
  );
  const ids = useMemo(() => new Set(linhas.map((l) => l.id)), [linhas]);
  const contaPorId = useMemo(() => new Map((dados?.linhas ?? []).map((l) => [l.id, l])), [dados]);
  const total = useMemo(() => totalizar(linhas), [linhas]);
  const grupos = useMemo(() => (visaoAtiva === "banco" ? agruparLinhas(linhas, "banco") : agruparLinhas(linhas, "empresa")), [linhas, visaoAtiva]);
  const lancamentos = useMemo(() => (dados?.lancamentos ?? []).filter((l) => ids.has(l.contaId)), [dados, ids]);
  const porConta = useMemo(() => {
    const mapa = new Map<string, Lancamento[]>();
    for (const l of lancamentos) {
      const lista = mapa.get(l.contaId);
      if (lista) lista.push(l);
      else mapa.set(l.contaId, [l]);
    }
    return mapa;
  }, [lancamentos]);
  const dias = useMemo(() => (dados && !umDia ? diaADia(linhas, dados.lancamentos, dados.de, dados.ate) : []), [dados, linhas, umDia]);
  const nEntradas = useMemo(() => contarLancamentos(lancamentos, "entrada"), [lancamentos]);
  const nSaidas = useMemo(() => contarLancamentos(lancamentos, "saida"), [lancamentos]);
  const outros = useMemo(() => partesDosOutros(composicaoOutros(lancamentos)), [lancamentos]);
  const fora = useMemo(() => resumoForaDosBancos(linhas), [linhas]);

  const listaFiltrada = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return lancamentos.filter((l) => {
      if (contaLista && l.contaId !== contaLista) return false;
      if (tipoLista !== "todos" && l.tipo !== tipoLista) return false;
      if (!q) return true;
      const c = contaPorId.get(l.contaId);
      return [l.quem, l.documento, l.historico, l.empresaTitulo, c?.empresa, c?.bancoNome, c?.conta, l.titulo ? String(l.titulo) : ""].some((t) => (t || "").toLowerCase().includes(q));
    });
  }, [lancamentos, busca, tipoLista, contaLista, contaPorId]);

  const alternar = (chave: string) =>
    setAbertos((antes) => {
      const depois = new Set(antes);
      if (depois.has(chave)) depois.delete(chave);
      else depois.add(chave);
      return depois;
    });

  const anterior = fechamentoAnterior(janela, hoje);
  const seguinte = fechamentoSeguinte(janela, hoje);
  const atalhos: { rotulo: string; janela: Janela }[] = [
    { rotulo: "Dia anterior", janela: padrao },
    { rotulo: "Hoje", janela: { de: hoje, ate: hoje } },
    { rotulo: "Semana passada", janela: semanaPassada(hoje) },
    { rotulo: "Este mês", janela: esteMes(hoje) },
    { rotulo: "Mês passado", janela: mesPassado(hoje) },
  ];

  const aplicarPeriodo = () => {
    if (!dataValida(deDigitado) || !dataValida(ateDigitado)) return toast.error("Preencha as duas datas.");
    if (deDigitado > ateDigitado) return toast.error("A data inicial é depois da final.");
    if (ateDigitado > hoje) return toast.error("O período não pode passar de hoje.");
    if (diasNoPeriodo(deDigitado, ateDigitado) > MAX_DIAS) return toast.error(`O período é de no máximo ${MAX_DIAS} dias.`);
    setJanela({ de: deDigitado, ate: ateDigitado });
    setPeriodoAberto(false);
  };

  // Baixa o fechamento que está na tela (com os filtros) num arquivo HTML para guardar,
  // mandar ou imprimir. Os números são os da tela: aqui só se monta o arquivo.
  const baixarHtml = async () => {
    if (!dados) return;
    const dataHora = (d: Date, sep: string) =>
      d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) + sep + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
    // Logo embutido, para o arquivo abrir igual em qualquer aparelho, mesmo sem internet.
    let logo: string | undefined;
    try {
      const resposta = await fetch("/logo-full.jpg");
      if (resposta.ok) {
        const imagem = await resposta.blob();
        logo = await new Promise<string>((ok, falha) => {
          const leitor = new FileReader();
          leitor.onload = () => ok(String(leitor.result));
          leitor.onerror = () => falha(leitor.error);
          leitor.readAsDataURL(imagem);
        });
      }
    } catch {
      // Sem o logo o cabeçalho sai só com o texto.
    }
    const nomes = (s: Set<string>, um: string, varios: string) => (s.size === 0 ? "" : s.size <= 2 ? Array.from(s).join(" e ") : `${s.size} ${s.size === 1 ? um : varios}`);
    const filtro = [nomes(empresas, "empresa", "empresas"), nomes(bancos, "banco", "bancos")].filter(Boolean).join(" · ");
    const marca = "Silva Packer";
    const posicao = new Date(dados.geradoEm);
    const html = montarFechamentoHtml({
      de: dados.de,
      ate: dados.ate,
      linhas,
      lancamentos,
      avisos: dados.avisos,
      marca,
      geradoEm: dataHora(new Date(), " "),
      posicao: Number.isNaN(posicao.getTime()) ? undefined : dataHora(posicao, " às "),
      filtro: filtro ? `só ${filtro}` : undefined,
      logo,
    });
    const url = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = nomeArquivoFechamento(marca, dados.de, dados.ate);
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    toast.success("Fechamento em HTML baixado.");
  };

  const vespera = somarDias(janela.de, -1);
  const variacao = total.saldoFinal - total.saldoAnterior;
  const temDiferenca = Math.abs(total.diferenca) > 0.005;
  const parcial = janela.ate === hoje;

  const cartoes: { rotulo: string; valor: string; sub: string; ponto: string; cor?: string; operador?: string; selo?: string; corSelo?: string; dica?: string }[] = [
    { rotulo: "Saldo anterior", valor: reais(total.saldoAnterior), sub: `fim de ${abrevDoDia(vespera)}, ${dataBr(vespera)}`, ponto: "bg-slate-400" },
    {
      rotulo: "Entradas",
      valor: reais(total.entradas),
      sub: plural(nEntradas, "recebimento", "recebimentos"),
      ponto: "bg-emerald-500",
      cor: VERDE,
      operador: "+",
      dica: "Títulos recebidos no período, nos bancos e no caixa interno (o mesmo Total Recebido do fechamento das 07:30).",
    },
    {
      rotulo: "Saídas",
      valor: reais(total.saidas),
      sub: plural(nSaidas, "pagamento", "pagamentos"),
      ponto: "bg-rose-500",
      cor: VERMELHO,
      operador: "−",
      dica: "Títulos pagos no período, pelos bancos, pelo caixa interno ou por conta da Holding (o mesmo Total Pago do fechamento das 07:30).",
    },
    {
      rotulo: "Outros movimentos",
      valor: total.outros === 0 ? reais(0) : comSinal(total.outros),
      sub:
        outros.length === 0
          ? "nenhum no período"
          : Math.abs(total.outros) < 0.005
            ? "se anulam no período"
            : outros.length <= 2
              ? outros.map((p) => p.rotulo).join(" e ")
              : `${outros[0].rotulo}, ${outros[1].rotulo} e mais`,
      dica: [DICA_OUTROS, ...outros.map((p) => `${p.rotulo}: ${comSinal(p.valor)}`)].join("\n"),
      ponto: "bg-violet-500",
      operador: "±",
    },
    {
      rotulo: parcial ? "Saldo até agora" : "Saldo final",
      valor: reais(total.saldoFinal),
      sub: umDia ? "variação no dia" : "variação no período",
      ponto: "bg-primary",
      operador: "=",
      selo: variacao === 0 ? "sem variação" : comSinal(variacao),
      corSelo: variacao > 0
        ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300"
        : variacao < 0
          ? "bg-rose-50 text-rose-800 dark:bg-rose-950/50 dark:text-rose-300"
          : undefined,
    },
  ];

  const celulaValor = (v: number, cor: string, sinal = false) =>
    v === 0 ? <span className={APAGADO}>-</span> : <span className={cor}>{sinal ? comSinal(v) : reais(v)}</span>;
  const celulaSaldo = (v: number | null) =>
    v === null ? <span className={APAGADO} title="O Sienge não devolveu o saldo desta conta">sem saldo</span> : <span className={v < 0 ? "text-red-600 dark:text-red-300/70" : ""}>{reais(v)}</span>;
  const SEM_SALDO_FORA = <span className={APAGADO} title="Fora dos bancos: o fechamento não soma saldo desta conta">—</span>;
  const CINZA = "text-slate-600 dark:text-slate-300";

  const NUM = "text-right tabular-nums whitespace-nowrap px-3";
  // Linhas do 1º nível (empresa ou banco) e do total: mais baixas em tela baixa, para as 10
  // empresas caberem sem rolar no notebook (1366x768). As faixas de altura não se sobrepõem,
  // para a ordem das regras no CSS não decidir nada.
  const TABELA = "w-full caption-bottom text-xs 2xl:text-sm [&_.n1>td]:py-2 [@media(min-height:741px)_and_(max-height:820px)]:[&_.n1>td]:py-1 [@media(max-height:740px)]:[&_.n1>td]:py-0.5";
  const CAB = "h-9 [@media(max-height:820px)]:h-8 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 whitespace-nowrap";
  const pilula = (ativo: boolean) =>
    `px-2.5 py-1 text-[11px] font-semibold rounded-md transition-all ${ativo ? "bg-white dark:bg-slate-700 text-primary dark:text-white shadow-sm" : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"}`;

  const linhaDoLancamento = (l: Lancamento) => (
    <TableRow key={`${l.contaId}-${l.id}`} className="bg-slate-50/40 dark:bg-slate-800/20 hover:bg-slate-50 dark:hover:bg-slate-800/40">
      <TableCell />
      <TableCell className="pl-12 py-1.5">
        <span className="text-xs text-slate-700 dark:text-slate-300">{l.quem || rotuloDoLancamento(l)}</span>
        {!umDia && <span className="ml-2 text-[11px] tabular-nums text-slate-500 dark:text-slate-400">{diaMes(l.data)}</span>}
        {l.documento && <span className="ml-2 text-[11px] text-slate-500 dark:text-slate-400">{l.documento}</span>}
        {l.abate && <Badge variant="secondary" className="ml-2 text-[10px] px-1.5 font-medium">{l.historico || "abate"}</Badge>}
        {l.categoria === "holding" && (
          <Badge variant="secondary" className="ml-2 text-[10px] px-1.5 font-medium" title="Título da Holding: o fechamento das 07:30 não conta, por isso fica em Outros">
            título da Holding
          </Badge>
        )}
        {l.empresaTitulo && l.categoria !== "holding" && (
          <Badge variant="secondary" className="ml-2 text-[10px] px-1.5 font-medium" title="Empresa dona do título, diferente da dona da conta">
            título: {l.empresaTitulo}
          </Badge>
        )}
      </TableCell>
      <TableCell />
      <TableCell className={`${NUM} py-1.5 text-xs`}>{l.tipo === "entrada" ? <span className={VERDE}>{reais(l.efeito)}</span> : null}</TableCell>
      <TableCell className={`${NUM} py-1.5 text-xs`}>{l.tipo === "saida" ? <span className={VERMELHO}>{reais(-l.efeito)}</span> : null}</TableCell>
      <TableCell className={`${NUM} py-1.5 text-xs`}>{l.tipo === "outro" ? <span className={CINZA}>{comSinal(l.efeito)}</span> : null}</TableCell>
      <TableCell />
    </TableRow>
  );

  const linhaDaConta = (l: LinhaConta, chaveGrupo: string) => {
    const chave = `${chaveGrupo}::${l.id}`;
    const lista = porConta.get(l.id) ?? [];
    const aberta = abertos.has(chave);
    const temLista = lista.length > 0;
    return (
      <React.Fragment key={chave}>
        <TableRow
          className={`bg-slate-50/70 dark:bg-slate-800/30 ${temLista ? "cursor-pointer hover:bg-slate-100/70 dark:hover:bg-slate-800/60" : ""}`}
          onClick={temLista ? () => alternar(chave) : undefined}
        >
          <TableCell className="w-[36px] px-2" />
          <TableCell className="pl-7 py-2">
            <span className="inline-flex items-center gap-1.5 align-middle">
              {temLista ? (aberta ? <ChevronDown className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400" /> : <ChevronRight className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400" />) : <span className="inline-block w-3.5" />}
              <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">{visaoAtiva === "banco" ? l.empresa : l.foraDosBancos ? l.bancoNome : l.instituicao}</span>
            </span>
            <span className="ml-2 text-[11px] font-mono text-slate-500 dark:text-slate-400">{l.conta}</span>
            {l.foraDosBancos && (
              <Badge variant="secondary" className="ml-2 text-[10px] px-1.5 font-medium" title="O dinheiro não passou pelos 17 bancos: está em Entradas e Saídas e volta em Outros, sem mexer no saldo">
                {visaoAtiva === "banco" ? l.bancoNome.toLowerCase() : "fora dos bancos"}
              </Badge>
            )}
            {l.detalhe && <Badge variant="secondary" className="ml-2 text-[10px] px-1.5 font-medium">{l.detalhe}</Badge>}
            {l.estimado && <Badge variant="secondary" className="ml-2 text-[10px] px-1.5 font-medium" title="O Sienge não devolveu esta conta; saldo da última posição gravada pelo painel">estimado</Badge>}
            {Math.abs(l.diferenca) > 0.005 && (
              <Badge variant="secondary" className="ml-2 text-[10px] px-1.5 font-medium" title={`No Sienge o saldo desta conta está em ${reais(l.saldoSienge ?? 0)}`}>
                Sienge {comSinal(l.diferenca)}
              </Badge>
            )}
          </TableCell>
          <TableCell className={`${NUM} py-2 text-xs text-slate-600 dark:text-slate-300`}>{l.foraDosBancos ? SEM_SALDO_FORA : celulaSaldo(l.saldoAnterior)}</TableCell>
          <TableCell className={`${NUM} py-2 text-xs`}>{celulaValor(l.entradas, VERDE)}</TableCell>
          <TableCell className={`${NUM} py-2 text-xs`}>{celulaValor(l.saidas, VERMELHO)}</TableCell>
          <TableCell className={`${NUM} py-2 text-xs`}>{celulaValor(l.outros, CINZA, true)}</TableCell>
          <TableCell className={`${NUM} py-2 text-xs font-semibold text-slate-700 dark:text-slate-200`}>{l.foraDosBancos ? SEM_SALDO_FORA : celulaSaldo(l.saldoFinal)}</TableCell>
        </TableRow>
        {aberta && lista.slice(0, LANCAMENTOS_POR_CONTA).map(linhaDoLancamento)}
        {aberta && l.foraDosBancos && Math.abs(l.outros) > 0.005 && (
          <TableRow className="bg-slate-50/40 dark:bg-slate-800/20">
            <TableCell />
            <TableCell className="pl-12 py-1.5 text-xs italic text-slate-600 dark:text-slate-400">Não passou pelos bancos: volta em Outros, sem mexer no saldo</TableCell>
            <TableCell />
            <TableCell />
            <TableCell />
            <TableCell className={`${NUM} py-1.5 text-xs`}>
              <span className={CINZA}>{comSinal(l.outros)}</span>
            </TableCell>
            <TableCell />
          </TableRow>
        )}
        {aberta && lista.length > LANCAMENTOS_POR_CONTA && (
          <TableRow className="bg-slate-50/40 dark:bg-slate-800/20">
            <TableCell />
            <TableCell colSpan={6} className="pl-12 py-1.5">
              <button
                type="button"
                className="text-[11px] font-semibold text-primary hover:underline"
                onClick={() => {
                  setContaLista(l.id);
                  setTipoLista("todos");
                  setVisao("lancamentos");
                }}
              >
                Ver os {lista.length} lançamentos desta conta
              </button>
            </TableCell>
          </TableRow>
        )}
      </React.Fragment>
    );
  };

  const contaDaLista = contaLista ? contaPorId.get(contaLista) : null;

  return (
    <div className="flex-1 min-h-0 flex flex-col gap-3">
      {/* Período e filtros */}
      <div className="flex items-center gap-2 flex-wrap shrink-0">
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setJanela(anterior)} title={`Fechamento anterior: ${rotuloDaJanela(anterior)}`} aria-label="Fechamento anterior">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Popover
            open={periodoAberto}
            onOpenChange={(aberto) => {
              setPeriodoAberto(aberto);
              if (aberto) {
                setDeDigitado(janela.de);
                setAteDigitado(janela.ate);
              }
            }}
          >
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 gap-2 font-semibold text-slate-800 dark:text-slate-100" title="Escolher outro dia ou período">
                <CalendarDays className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400" />
                {rotuloDaJanela(janela)}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-72 space-y-3">
              <div className="space-y-1.5">
                <label htmlFor="fechamento-dia" className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Um dia</label>
                <Input
                  id="fechamento-dia"
                  type="date"
                  max={hoje}
                  value={umDia ? janela.de : ""}
                  onChange={(e) => {
                    const d = e.target.value;
                    if (dataValida(d) && d <= hoje) {
                      setJanela({ de: d, ate: d });
                      setPeriodoAberto(false);
                    }
                  }}
                />
              </div>
              <div className="space-y-1.5 border-t pt-3">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Período</p>
                <div className="grid grid-cols-2 gap-2">
                  <Input type="date" aria-label="De" max={hoje} value={deDigitado} onChange={(e) => setDeDigitado(e.target.value)} />
                  <Input type="date" aria-label="Até" max={hoje} value={ateDigitado} onChange={(e) => setAteDigitado(e.target.value)} />
                </div>
                <Button size="sm" className="w-full" onClick={aplicarPeriodo}>Ver o período</Button>
              </div>
            </PopoverContent>
          </Popover>
          <Button variant="outline" size="icon" className="h-8 w-8" disabled={!seguinte} onClick={() => seguinte && setJanela(seguinte)} title={seguinte ? `Fechamento seguinte: ${rotuloDaJanela(seguinte)}` : "Não há fechamento depois deste"} aria-label="Fechamento seguinte">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <div role="group" aria-label="Atalhos de período" className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg">
          {atalhos.map((a) => (
            <button key={a.rotulo} type="button" aria-pressed={mesmaJanela(a.janela, janela)} onClick={() => setJanela(a.janela)} className={pilula(mesmaJanela(a.janela, janela))} title={rotuloDaJanela(a.janela)}>
              {a.rotulo}
            </button>
          ))}
        </div>

        <MultiSelectFilter
          label="Empresas"
          icon={<Building2 className="h-4 w-4" />}
          allOptions={todasEmpresas}
          selected={empresas}
          onToggle={(nome) => setEmpresas((antes) => { const d = new Set(antes); if (d.has(nome)) d.delete(nome); else d.add(nome); return d; })}
          onSelectAll={() => setEmpresas(new Set(todasEmpresas))}
          onClear={() => setEmpresas(new Set())}
          activeColor="blue"
        />
        <MultiSelectFilter
          label="Bancos"
          icon={<Landmark className="h-4 w-4" />}
          allOptions={todosBancos}
          selected={bancos}
          onToggle={(nome) => setBancos((antes) => { const d = new Set(antes); if (d.has(nome)) d.delete(nome); else d.add(nome); return d; })}
          onSelectAll={() => setBancos(new Set(todosBancos))}
          onClear={() => setBancos(new Set())}
          activeColor="violet"
        />
        {filtrado && (
          <button type="button" className="text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white" title="Limpar os filtros de empresa e banco" aria-label="Limpar filtros" onClick={() => { setEmpresas(new Set()); setBancos(new Set()); }}>
            <X className="h-4 w-4" />
          </button>
        )}

        <div className="ml-auto flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
          {dados && <span title="Hora em que o painel buscou saldos e movimentos no Sienge">{atualizando ? "buscando no Sienge…" : horaDaPosicao(dados.geradoEm, hoje)}</span>}
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            disabled={carregando || atualizando}
            title="Buscar de novo no Sienge"
            aria-label="Buscar de novo no Sienge"
            onClick={() => {
              forcar.current = true;
              setRecarga((n) => n + 1);
            }}
          >
            {carregando || atualizando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 text-slate-700 dark:text-slate-200"
            disabled={!dados}
            title="Baixar este fechamento em HTML, para guardar, mandar ou imprimir"
            onClick={baixarHtml}
          >
            <FileDown className="h-3.5 w-3.5" />
            HTML
          </Button>
        </div>
      </div>

      {erro && !dados ? (
        <div className="flex-1 min-h-0 flex flex-col items-center justify-center gap-3 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
          <p className="text-sm text-slate-700 dark:text-slate-300">{erro}</p>
          <Button size="sm" variant="outline" onClick={() => { forcar.current = true; setRecarga((n) => n + 1); }}>Tentar de novo</Button>
        </div>
      ) : !dados ? (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3 shrink-0">
            {[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-[84px] rounded-2xl" />)}
          </div>
          <div className="flex-1 min-h-0 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 flex items-center justify-center gap-2 text-sm text-slate-500 dark:text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin" /> Buscando o fechamento no Sienge…
          </div>
        </>
      ) : (
        <>
          {/* Cartões: a conta do fechamento, da esquerda para a direita */}
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3 shrink-0">
            {cartoes.map((c) => (
              <div key={c.rotulo} title={c.dica} className="relative rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-3 min-w-0">
                {c.operador && (
                  <span aria-hidden className="hidden xl:flex absolute -left-[17px] top-1/2 -translate-y-1/2 z-10 h-[22px] w-[22px] items-center justify-center rounded-full border border-slate-200 dark:border-slate-700 bg-background text-[13px] font-semibold leading-none text-slate-500 dark:text-slate-400">
                    {c.operador}
                  </span>
                )}
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${c.ponto}`} />
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400 truncate">{c.rotulo}</p>
                </div>
                <p className={`mt-1.5 font-semibold tabular-nums whitespace-nowrap leading-tight text-[clamp(1rem,1.15vw,1.5rem)] ${c.cor || "text-slate-900 dark:text-slate-50"}`}>{c.valor}</p>
                <div className="mt-1 flex items-center gap-2 min-w-0">
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{c.sub}</p>
                  {c.selo && (
                    <span className={`ml-auto shrink-0 rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular-nums leading-none ${c.corSelo || "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"}`}>{c.selo}</span>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Notas: o que não está nos cartões */}
          {(fora.length > 0 || temDiferenca || total.incompleto || dados.avisos.length > 0 || parcial) && (
            <div className="flex items-center gap-x-5 gap-y-1 flex-wrap shrink-0 px-1 text-[11px] text-slate-600 dark:text-slate-400">
              {parcial && (
                <span className="inline-flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-sky-500" />O dia de hoje ainda está aberto: os valores mudam conforme os lançamentos entram no Sienge.</span>
              )}
              {fora.map((f) => (
                <span
                  key={f.rotulo}
                  className="inline-flex items-center gap-1"
                  title="Títulos pagos ou recebidos fora dos 17 bancos. Estão em Entradas e Saídas, como no fechamento das 07:30, e voltam em Outros: o saldo dos bancos não muda."
                >
                  <span className="mr-0.5 h-1.5 w-1.5 rounded-full bg-amber-500" />
                  {f.rotulo}:
                  {f.recebido !== 0 && (
                    <span>
                      recebido <strong className="font-semibold text-slate-800 dark:text-slate-200 tabular-nums">{reais(f.recebido)}</strong>
                    </span>
                  )}
                  {f.recebido !== 0 && f.pago !== 0 && <span>·</span>}
                  {f.pago !== 0 && (
                    <span>
                      pago <strong className="font-semibold text-slate-800 dark:text-slate-200 tabular-nums">{reais(f.pago)}</strong>
                    </span>
                  )}
                  <span>(fora dos bancos)</span>
                </span>
              ))}
              {temDiferenca && (
                <span className="inline-flex items-center gap-1.5" title="O saldo do Sienge demora a refletir lançamento feito há pouco. O saldo final do painel soma os movimentos, que já aparecem.">
                  <span className="h-1.5 w-1.5 rounded-full bg-violet-500" />
                  Saldo no Sienge: <strong className="font-semibold text-slate-800 dark:text-slate-200 tabular-nums">{reais(total.saldoSienge)}</strong>.
                  {" "}{reais(Math.abs(total.diferenca))} em lançamentos recentes ainda não entraram nele
                </span>
              )}
              {dados.avisos.map((a) => (
                <span key={a} className="inline-flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-red-500" />{a}</span>
              ))}
            </div>
          )}

          {/* Tabela */}
          <div className="flex-1 min-h-0 flex flex-col rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden">
            <div className="flex items-center justify-between gap-3 flex-wrap px-4 py-2 border-b border-slate-200 dark:border-slate-700 shrink-0">
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                  {visaoAtiva === "empresa" ? "Fechamento por empresa" : visaoAtiva === "banco" ? "Fechamento por banco" : visaoAtiva === "dias" ? "Dia a dia" : "Lançamentos"}
                </h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 [@media(max-height:820px)]:hidden">
                  {visaoAtiva === "empresa" && "Clique na empresa para ver as contas e na conta para ver os lançamentos"}
                  {visaoAtiva === "banco" && "Clique no banco para ver as contas e na conta para ver os lançamentos"}
                  {visaoAtiva === "dias" && "Clique num dia para abrir o fechamento dele"}
                  {visaoAtiva === "lancamentos" && `${plural(listaFiltrada.length, "lançamento", "lançamentos")} no período`}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {visaoAtiva === "lancamentos" && (
                  <>
                    {contaDaLista && (
                      <button type="button" onClick={() => setContaLista(null)} className="inline-flex items-center gap-1 rounded-md border border-slate-200 dark:border-slate-700 px-2 py-1 text-[11px] font-semibold text-slate-600 dark:text-slate-300" title="Mostrar todas as contas">
                        {contaDaLista.instituicao} {contaDaLista.conta} <X className="h-3 w-3" />
                      </button>
                    )}
                    <div className="relative">
                      <Search className="absolute left-2 top-1.5 h-3.5 w-3.5 text-slate-500 dark:text-slate-400" />
                      <input
                        type="text"
                        value={busca}
                        onChange={(e) => setBusca(e.target.value)}
                        placeholder="Buscar quem, documento, conta…"
                        aria-label="Buscar nos lançamentos"
                        className="h-7 w-56 rounded-md border border-slate-200 dark:border-slate-700 bg-transparent pl-7 pr-2 text-xs text-slate-800 dark:text-slate-100 placeholder:text-slate-500 dark:placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/40"
                      />
                    </div>
                    <div role="group" aria-label="Tipo de lançamento" className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg">
                      {(["todos", "entrada", "saida", "outro"] as const).map((t) => (
                        <button key={t} type="button" aria-pressed={tipoLista === t} onClick={() => setTipoLista(t)} className={pilula(tipoLista === t)}>
                          {t === "todos" ? "Todos" : t === "entrada" ? "Entradas" : t === "saida" ? "Saídas" : "Outros"}
                        </button>
                      ))}
                    </div>
                  </>
                )}
                <div role="group" aria-label="Como ver o fechamento" className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg">
                  {(["empresa", "banco", "dias", "lancamentos"] as const).map((v) =>
                    v === "dias" && umDia ? null : (
                      <button key={v} type="button" aria-pressed={visaoAtiva === v} onClick={() => trocarVisao(v)} className={pilula(visaoAtiva === v)}>
                        {v === "empresa" ? "Por empresa" : v === "banco" ? "Por banco" : v === "dias" ? "Dia a dia" : "Lançamentos"}
                      </button>
                    )
                  )}
                </div>
              </div>
            </div>

            <div className="flex-1 min-h-0 overflow-auto">
              {(visaoAtiva === "empresa" || visaoAtiva === "banco") && (
                <table className={TABELA}>
                  <TableHeader className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-800">
                    <TableRow>
                      <TableHead className="w-[36px]" />
                      <TableHead className={CAB}>{visaoAtiva === "banco" ? "Banco" : "Empresa"}</TableHead>
                      <TableHead className={`${CAB} text-right px-3`}>Saldo anterior</TableHead>
                      <TableHead className={`${CAB} text-right px-3`}>Entradas</TableHead>
                      <TableHead className={`${CAB} text-right px-3`}>Saídas</TableHead>
                      <TableHead className={`${CAB} text-right px-3`} title={DICA_OUTROS}>Outros</TableHead>
                      <TableHead className={`${CAB} text-right px-3`}>{parcial ? "Saldo até agora" : "Saldo final"}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {grupos.map((g) => {
                      const chave = `${visaoAtiva}::${g.nome}`;
                      const aberto = abertos.has(chave);
                      return (
                        <React.Fragment key={chave}>
                          <TableRow className="n1 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800" onClick={() => alternar(chave)}>
                            <TableCell className="w-[36px] px-2">
                              {aberto ? <ChevronDown className="h-4 w-4 text-slate-500 dark:text-slate-400" /> : <ChevronRight className="h-4 w-4 text-slate-500 dark:text-slate-400" />}
                            </TableCell>
                            <TableCell className="font-semibold text-slate-700 dark:text-slate-200">
                              {visaoAtiva === "banco" && <Landmark className="h-4 w-4 inline-block mr-1.5 -mt-0.5 text-slate-500 dark:text-slate-400" />}
                              {g.nome}
                              <Badge variant="secondary" className="ml-2 h-[18px] py-0 text-[10px] px-1" title={plural(g.linhas.length, "conta", "contas")}>{g.linhas.length}</Badge>
                            </TableCell>
                            <TableCell className={`${NUM} text-slate-600 dark:text-slate-300`}>{g.semSaldo ? SEM_SALDO_FORA : reais(g.total.saldoAnterior)}</TableCell>
                            <TableCell className={`${NUM} font-medium`}>{celulaValor(g.total.entradas, VERDE)}</TableCell>
                            <TableCell className={`${NUM} font-medium`}>{celulaValor(g.total.saidas, VERMELHO)}</TableCell>
                            <TableCell className={`${NUM}`}>{celulaValor(g.total.outros, CINZA, true)}</TableCell>
                            <TableCell className={`${NUM} font-bold ${g.total.saldoFinal < 0 ? "text-red-600 dark:text-red-300/70" : "text-slate-900 dark:text-slate-50"}`}>{g.semSaldo ? SEM_SALDO_FORA : reais(g.total.saldoFinal)}</TableCell>
                          </TableRow>
                          {aberto && g.linhas.map((l) => linhaDaConta(l, chave))}
                        </React.Fragment>
                      );
                    })}
                    {grupos.length === 0 && (
                      <TableRow><TableCell colSpan={7} className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">Nenhuma conta com esses filtros.</TableCell></TableRow>
                    )}
                  </TableBody>
                  <tfoot className="sticky bottom-0 z-10 bg-slate-50 dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700">
                    <tr className="n1">
                      <td />
                      <td className="px-4 font-bold text-slate-800 dark:text-slate-100">Total{filtrado ? " (filtrado)" : ""}</td>
                      <td className={`${NUM} font-bold text-slate-800 dark:text-slate-100`}>{reais(total.saldoAnterior)}</td>
                      <td className={`${NUM} font-bold`}>{celulaValor(total.entradas, VERDE)}</td>
                      <td className={`${NUM} font-bold`}>{celulaValor(total.saidas, VERMELHO)}</td>
                      <td className={`${NUM} font-bold`}>{celulaValor(total.outros, "text-slate-700 dark:text-slate-200", true)}</td>
                      <td className={`${NUM} font-bold text-slate-900 dark:text-slate-50`}>{reais(total.saldoFinal)}</td>
                    </tr>
                  </tfoot>
                </table>
              )}

              {visaoAtiva === "dias" && (
                <table className={TABELA}>
                  <TableHeader className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-800">
                    <TableRow>
                      <TableHead className={`${CAB} pl-4`}>Dia</TableHead>
                      <TableHead className={`${CAB} text-right px-3`}>Lançamentos</TableHead>
                      <TableHead className={`${CAB} text-right px-3`}>Entradas</TableHead>
                      <TableHead className={`${CAB} text-right px-3`}>Saídas</TableHead>
                      <TableHead className={`${CAB} text-right px-3`} title={DICA_OUTROS}>Outros</TableHead>
                      <TableHead className={`${CAB} text-right px-3`}>Saldo no fim do dia</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dias.map((d) => {
                      const semExpediente = !ehDiaUtil(d.data);
                      return (
                        <TableRow key={d.data} className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800" onClick={() => setJanela({ de: d.data, ate: d.data })} title={`Abrir o fechamento de ${dataBr(d.data)}`}>
                          <TableCell className={`pl-4 py-2 font-medium ${semExpediente ? "text-slate-500 dark:text-slate-400" : "text-slate-700 dark:text-slate-200"}`}>
                            <span className="inline-block w-9 text-slate-500 dark:text-slate-400">{abrevDoDia(d.data)}</span>
                            <span className="tabular-nums">{dataBr(d.data)}</span>
                            {feriado(d.data) && <Badge variant="secondary" className="ml-2 text-[10px] px-1.5 font-medium">{feriado(d.data)}</Badge>}
                          </TableCell>
                          <TableCell className={`${NUM} py-2 text-slate-600 dark:text-slate-300`}>{d.qtd === 0 ? <span className={APAGADO}>-</span> : d.qtd}</TableCell>
                          <TableCell className={`${NUM} py-2`}>{celulaValor(d.entradas, VERDE)}</TableCell>
                          <TableCell className={`${NUM} py-2`}>{celulaValor(d.saidas, VERMELHO)}</TableCell>
                          <TableCell className={`${NUM} py-2`}>{celulaValor(d.outros, CINZA, true)}</TableCell>
                          <TableCell className={`${NUM} py-2 font-semibold text-slate-800 dark:text-slate-100`}>{reais(d.saldoFinal)}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                  <tfoot className="sticky bottom-0 z-10 bg-slate-50 dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700">
                    <tr className="n1">
                      <td className="pl-4 font-bold text-slate-800 dark:text-slate-100">Total do período</td>
                      <td className={`${NUM} font-bold text-slate-800 dark:text-slate-100`}>{total.qtd}</td>
                      <td className={`${NUM} font-bold`}>{celulaValor(total.entradas, VERDE)}</td>
                      <td className={`${NUM} font-bold`}>{celulaValor(total.saidas, VERMELHO)}</td>
                      <td className={`${NUM} font-bold`}>{celulaValor(total.outros, "text-slate-700 dark:text-slate-200", true)}</td>
                      <td className={`${NUM} font-bold text-slate-900 dark:text-slate-50`}>{reais(total.saldoFinal)}</td>
                    </tr>
                  </tfoot>
                </table>
              )}

              {visaoAtiva === "lancamentos" && (
                <table className="w-full caption-bottom text-xs">
                  <TableHeader className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-800">
                    <TableRow>
                      <TableHead className={`${CAB} pl-4`}>Data</TableHead>
                      <TableHead className={CAB}>Quem</TableHead>
                      <TableHead className={CAB}>Documento</TableHead>
                      <TableHead className={CAB}>Conta</TableHead>
                      <TableHead className={CAB}>Tipo</TableHead>
                      <TableHead className={`${CAB} text-right px-3`}>Valor</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {listaFiltrada.slice(0, LANCAMENTOS_NA_LISTA).map((l) => {
                      const c = contaPorId.get(l.contaId);
                      return (
                        <TableRow key={`${l.contaId}-${l.id}`}>
                          <TableCell className="pl-4 py-1.5 tabular-nums whitespace-nowrap text-slate-600 dark:text-slate-300">{dataBr(l.data)}</TableCell>
                          <TableCell className="py-1.5 text-slate-800 dark:text-slate-200">
                            {l.quem || "-"}
                            {l.empresaTitulo && l.categoria !== "holding" && <span className="ml-1.5 text-[11px] text-slate-500 dark:text-slate-400">· título: {l.empresaTitulo}</span>}
                          </TableCell>
                          <TableCell className="py-1.5 text-slate-600 dark:text-slate-400">{l.documento || "-"}{l.titulo ? <span className="ml-1.5 text-[11px]">· título {l.titulo}</span> : null}</TableCell>
                          <TableCell className="py-1.5 text-slate-600 dark:text-slate-400 whitespace-nowrap">{c ? `${c.empresa.split(" ").slice(0, 3).join(" ")} · ${c.foraDosBancos ? c.bancoNome : `${c.instituicao} ${c.conta}`}` : l.contaId}</TableCell>
                          <TableCell className="py-1.5 text-slate-600 dark:text-slate-400 whitespace-nowrap">{rotuloDoLancamento(l)}</TableCell>
                          <TableCell className={`${NUM} py-1.5 font-medium ${l.efeito >= 0 ? VERDE : VERMELHO}`}>{comSinal(l.efeito)}</TableCell>
                        </TableRow>
                      );
                    })}
                    {listaFiltrada.length === 0 && (
                      <TableRow><TableCell colSpan={6} className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">Nenhum lançamento {busca || tipoLista !== "todos" || contaLista ? "com esses filtros" : "no período"}.</TableCell></TableRow>
                    )}
                    {listaFiltrada.length > LANCAMENTOS_NA_LISTA && (
                      <TableRow><TableCell colSpan={6} className="py-3 text-center text-[11px] text-slate-500 dark:text-slate-400">Mostrando os {LANCAMENTOS_NA_LISTA} primeiros de {listaFiltrada.length}. Use a busca ou um período menor para ver os demais.</TableCell></TableRow>
                    )}
                  </TableBody>
                </table>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
