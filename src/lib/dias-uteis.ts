// Dias úteis bancários e as janelas do Fechamento de Caixa (Edielson, 18/11/2026).
//
// Mesma regra do `feriados.py` da rotina das 07:30 (repositório rotinas-silvapacker):
// feriados bancários nacionais (os fixos, Carnaval segunda e terça, Sexta-feira Santa e
// Corpus Christi). Feriado conta como fim de semana: o fechamento do dia útil seguinte
// cobre desde o último dia útil, do mesmo jeito que a segunda cobre sexta a domingo.
//
// Datas sempre em texto "AAAA-MM-DD" (sem hora e sem fuso), que é como o Sienge devolve.

const FIXOS: [number, number, string][] = [
  [1, 1, "Confraternização Universal"],
  [4, 21, "Tiradentes"],
  [5, 1, "Dia do Trabalho"],
  [9, 7, "Independência"],
  [10, 12, "Nossa Senhora Aparecida"],
  [11, 2, "Finados"],
  [11, 15, "Proclamação da República"],
  [11, 20, "Consciência Negra"],
  [12, 25, "Natal"],
];

const DIAS = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];
const ABREV = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

const dois = (n: number) => String(n).padStart(2, "0");
const iso = (ano: number, mes: number, dia: number) => `${ano}-${dois(mes)}-${dois(dia)}`;

/** Meio-dia UTC da data: longe da virada, nenhuma conta de dias escorrega por fuso. */
function emUtc(data: string): Date {
  const [a, m, d] = data.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d, 12));
}
function deUtc(d: Date): string {
  return iso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

export function somarDias(data: string, n: number): string {
  const d = emUtc(data);
  d.setUTCDate(d.getUTCDate() + n);
  return deUtc(d);
}

/** 0 = domingo … 6 = sábado. */
export function diaDaSemana(data: string): number {
  return emUtc(data).getUTCDay();
}

/** Quantos dias de `de` até `ate`, contando os dois. */
export function diasNoPeriodo(de: string, ate: string): number {
  return Math.round((emUtc(ate).getTime() - emUtc(de).getTime()) / 86_400_000) + 1;
}

/** Domingo de Páscoa (Meeus/Jones/Butcher), como no feriados.py. */
function pascoa(ano: number): string {
  const a = ano % 19, b = Math.floor(ano / 100), c = ano % 100;
  const d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return iso(ano, mes, dia);
}

const feriadosDoAno = new Map<number, Map<string, string>>();

/** { "AAAA-MM-DD": nome } dos feriados bancários nacionais do ano. */
export function feriados(ano: number): Map<string, string> {
  let mapa = feriadosDoAno.get(ano);
  if (!mapa) {
    mapa = new Map(FIXOS.map(([m, d, nome]) => [iso(ano, m, d), nome]));
    const p = pascoa(ano);
    mapa.set(somarDias(p, -48), "Carnaval");
    mapa.set(somarDias(p, -47), "Carnaval");
    mapa.set(somarDias(p, -2), "Sexta-feira Santa");
    mapa.set(somarDias(p, 60), "Corpus Christi");
    feriadosDoAno.set(ano, mapa);
  }
  return mapa;
}

/** Nome do feriado na data, ou null. */
export function feriado(data: string): string | null {
  return feriados(Number(data.slice(0, 4))).get(data) ?? null;
}

export function ehDiaUtil(data: string): boolean {
  const s = diaDaSemana(data);
  return s !== 0 && s !== 6 && feriado(data) === null;
}

export function ultimoDiaUtilAntes(data: string): string {
  let d = somarDias(data, -1);
  while (!ehDiaUtil(d)) d = somarDias(d, -1);
  return d;
}

export function proximoDiaUtilDepois(data: string): string {
  let d = somarDias(data, 1);
  while (!ehDiaUtil(d)) d = somarDias(d, 1);
  return d;
}

export interface Janela {
  de: string;
  ate: string;
}

const menor = (a: string, b: string) => (a < b ? a : b);

/**
 * O fechamento de um dia útil: ele mesmo e os dias sem expediente que vêm logo depois
 * (sexta leva sábado e domingo; véspera de feriado leva o feriado). Nunca passa de `limite`.
 */
export function janelaDoDiaUtil(diaUtil: string, limite: string): Janela {
  return { de: diaUtil, ate: menor(somarDias(proximoDiaUtilDepois(diaUtil), -1), limite) };
}

/**
 * Fechamento do "dia anterior", o que a aba abre: do último dia útil antes de hoje até
 * ontem. Dia comum: só ontem. Segunda: sexta a domingo. Dia seguinte a feriado: inclui o feriado.
 */
export function janelaDoFechamento(hoje: string): Janela {
  return { de: ultimoDiaUtilAntes(hoje), ate: somarDias(hoje, -1) };
}

/** O fechamento anterior ao que está na tela (seta para a esquerda). */
export function fechamentoAnterior(janela: Janela, hoje: string): Janela {
  return janelaDoDiaUtil(ultimoDiaUtilAntes(janela.de), hoje);
}

/** O fechamento seguinte (seta para a direita); null quando o seguinte ainda não começou. */
export function fechamentoSeguinte(janela: Janela, hoje: string): Janela | null {
  const proximo = ehDiaUtil(somarDias(janela.ate, 1)) ? somarDias(janela.ate, 1) : proximoDiaUtilDepois(janela.ate);
  if (proximo > hoje) return null;
  return janelaDoDiaUtil(proximo, hoje);
}

/** Segunda a domingo da semana anterior à de `hoje`. */
export function semanaPassada(hoje: string): Janela {
  const s = diaDaSemana(hoje); // 0 = domingo
  const segundaDestaSemana = somarDias(hoje, -((s + 6) % 7));
  return { de: somarDias(segundaDestaSemana, -7), ate: somarDias(segundaDestaSemana, -1) };
}

/** Do dia 1 do mês de `hoje` até hoje. */
export function esteMes(hoje: string): Janela {
  return { de: `${hoje.slice(0, 7)}-01`, ate: hoje };
}

/** O mês anterior ao de `hoje`, inteiro. */
export function mesPassado(hoje: string): Janela {
  const ultimo = somarDias(`${hoje.slice(0, 7)}-01`, -1);
  return { de: `${ultimo.slice(0, 7)}-01`, ate: ultimo };
}

export const mesmaJanela = (a: Janela, b: Janela) => a.de === b.de && a.ate === b.ate;

/** "17/11/2026" */
export function dataBr(data: string): string {
  const [a, m, d] = data.split("-");
  return `${d}/${m}/${a}`;
}

/** "17/11" */
export function diaMes(data: string): string {
  const [, m, d] = data.split("-");
  return `${d}/${m}`;
}

/** "Terça-feira" */
export function nomeDoDia(data: string): string {
  return DIAS[diaDaSemana(data)];
}

/** "ter" */
export function abrevDoDia(data: string): string {
  return ABREV[diaDaSemana(data)];
}

/** "Terça-feira, 17/11/2026" para um dia; "sex 13/11 a dom 15/11/2026" para vários. */
export function rotuloDaJanela(j: Janela): string {
  if (j.de === j.ate) return `${nomeDoDia(j.ate)}, ${dataBr(j.ate)}`;
  const mesmoAno = j.de.slice(0, 4) === j.ate.slice(0, 4);
  return `${abrevDoDia(j.de)} ${mesmoAno ? diaMes(j.de) : dataBr(j.de)} a ${abrevDoDia(j.ate)} ${dataBr(j.ate)}`;
}

/** Hoje em Brasília, "AAAA-MM-DD" (servidor em UTC e navegador em qualquer fuso dão o mesmo dia). */
export function hojeEmBrasilia(agora: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(agora);
}

const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/;

/** Data válida no formato AAAA-MM-DD (31/02 não passa). */
export function dataValida(data: string | null | undefined): data is string {
  return !!data && DATA_ISO.test(data) && deUtc(emUtc(data)) === data;
}
