import { arred } from "../motor/calculos";
import { parametrosEm } from "../motor/parametros";
import type { Debito } from "../motor/tipos";
import { chamar, SERVICOS } from "./integra-contador";

/**
 * Obrigações do Simples Nacional pelo Integra Contador:
 * PGDAS-D (declarações e DAS por mês), DEFIS (por ano) e parcelamentos (PARCSN).
 * Os débitos com valor vêm do Relatório de Situação Fiscal; aqui se apuram as omissões.
 */

export interface PeriodoPgdas {
  /** AAAAMM */
  periodo: string;
  declaracoes: number;
  retificada: boolean;
  ultimaTransmissao?: string;
  malha?: string;
  dasGerado: boolean;
  dasPago?: boolean;
}

export interface ParcelamentoSn {
  numero: string;
  modalidade: string;
  pedido?: string;
  situacao?: string;
}

export interface ObrigacoesSimples {
  periodos: PeriodoPgdas[];
  defisEntregues: number[];
  parcelamentos: ParcelamentoSn[];
  /** Meses AAAAMM sem PGDAS-D, já vencidos. */
  pgdasOmissos: string[];
  /** Anos sem DEFIS, já vencidos. */
  defisOmissas: number[];
  /** Meses com DAS gerado e não pago (indício: o valor vem do relatório de situação fiscal). */
  dasNaoPagos: string[];
  avisos: string[];
}

type Obj = Record<string, unknown>;
const ehObj = (o: unknown): o is Obj => !!o && typeof o === "object" && !Array.isArray(o);
const lista = (o: unknown): Obj[] => (Array.isArray(o) ? o.filter(ehObj) : ehObj(o) ? [o] : []);

/** "20250115103000" → "15/01/2025 10:30" */
export function dataHoraSerpro(v: unknown): string | undefined {
  const s = String(v ?? "");
  if (!/^\d{8}/.test(s)) return undefined;
  const d = `${s.slice(6, 8)}/${s.slice(4, 6)}/${s.slice(0, 4)}`;
  return s.length >= 12 ? `${d} ${s.slice(8, 10)}:${s.slice(10, 12)}` : d;
}

/** Resposta do PGDASD CONSDECLARACAO13: { anoCalendario, periodos: [{ periodoApuracao, operacoes: [...] }] }. */
export function mapearPgdasd(dados: unknown): PeriodoPgdas[] {
  const raiz = ehObj(dados) ? dados : lista(dados)[0];
  if (!raiz) return [];
  const periodos = [...lista(raiz.periodos), ...lista(raiz.periodo)];
  return periodos
    .map((per) => {
      const ops = lista(per.operacoes);
      const decl = ops.filter((o) => /Declara/i.test(String(o.tipoOperacao ?? "")) && ehObj(o.indiceDeclaracao));
      const das = ops.filter((o) => ehObj(o.indiceDas));
      const ultima = decl.map((o) => o.indiceDeclaracao as Obj).sort((a, b) => String(a.dataHoraTransmissao).localeCompare(String(b.dataHoraTransmissao))).at(-1);
      const pagos = das.map((o) => (o.indiceDas as Obj).dasPago);
      return {
        periodo: String(per.periodoApuracao ?? ""),
        declaracoes: decl.length,
        retificada: decl.some((o) => /Retific/i.test(String(o.tipoOperacao))),
        ultimaTransmissao: dataHoraSerpro(ultima?.dataHoraTransmissao),
        malha: ultima?.malha ? String(ultima.malha) : undefined,
        dasGerado: das.length > 0,
        dasPago: das.length ? pagos.some((x) => x === true) : undefined,
      };
    })
    .filter((p) => /^\d{6}$/.test(p.periodo));
}

/** DEFIS: aceita lista de { ano | anoCalendario } (formato a CONFERIR com resposta real). */
export function mapearDefis(dados: unknown): number[] {
  const itens = ehObj(dados) && !("ano" in dados) && !("anoCalendario" in dados) ? Object.values(dados).flatMap(lista) : lista(dados);
  const anos = itens.map((o) => Number(o.ano ?? o.anoCalendario ?? o.exercicio)).filter((n) => n > 2000);
  return [...new Set(anos)].sort();
}

/** PARCSN: { parcelamentos: [{ numero, dataDoPedido, situacao, dataDaSituacao }] } (formato a CONFERIR). */
export function mapearParcelamentos(dados: unknown, modalidade: string): ParcelamentoSn[] {
  const raiz = ehObj(dados) ? (dados.parcelamentos ?? dados.listaParcelamentos ?? dados) : dados;
  return lista(raiz)
    .filter((o) => o.numero !== undefined)
    .map((o) => ({ numero: String(o.numero), modalidade, pedido: dataHoraSerpro(o.dataDoPedido ?? o.dataPedido), situacao: o.situacao ? String(o.situacao) : undefined }));
}

const aaaamm = (ano: number, mes: number) => `${ano}${String(mes).padStart(2, "0")}`;

/** Último período de apuração com PGDAS-D vencido (prazo: dia 20 do mês seguinte). */
export function ultimoPeriodoVencido(dataIso: string): string {
  const [ano, mes, dia] = dataIso.split("-").map(Number);
  let a = ano, m = mes - (dia > 20 ? 1 : 2);
  while (m <= 0) {
    m += 12;
    a--;
  }
  return aaaamm(a, m);
}

/** Meses sem declaração entre o início (AAAAMM) e o último período vencido. */
export function mesesOmissos(transmitidos: string[], inicio: string, dataIso: string): string[] {
  const fim = ultimoPeriodoVencido(dataIso);
  const feitos = new Set(transmitidos);
  const r: string[] = [];
  let a = Number(inicio.slice(0, 4)), m = Number(inicio.slice(4, 6));
  while (aaaamm(a, m) <= fim) {
    if (!feitos.has(aaaamm(a, m))) r.push(aaaamm(a, m));
    if (++m > 12) {
      m = 1;
      a++;
    }
  }
  return r;
}

/** Anos sem DEFIS (prazo: 31 de março do ano seguinte). */
export function anosDefisOmissos(entregues: number[], anoInicio: number, dataIso: string): number[] {
  const [ano, mes] = dataIso.split("-").map(Number);
  const ultimo = mes > 3 ? ano - 1 : ano - 2;
  const r: number[] = [];
  for (let a = anoInicio; a <= ultimo; a++) if (!entregues.includes(a)) r.push(a);
  return r;
}

/** Omissões viram débitos com a multa mínima (o valor real depende dos tributos declarados). */
export function debitosDeOmissoes(o: Pick<ObrigacoesSimples, "pgdasOmissos" | "defisOmissas">, dataIso: string): Debito[] {
  const p = parametrosEm(dataIso);
  return [
    ...o.pgdasOmissos.map((pa) => ({
      tipo: "PGDAS_OMISSA" as const,
      orgao: "RECEITA" as const,
      descricao: "PGDAS-D não transmitido",
      competencia: `${pa.slice(4)}/${pa.slice(0, 4)}`,
      valor: 0,
      situacao: `multa mínima de ${arred(p.multasSimples.pgdasMensal).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} (MAED); o DAS do mês entra depois de declarado`,
      origem: "integra" as const,
    })),
    ...o.defisOmissas.map((ano) => ({
      tipo: "DEFIS_OMISSA" as const,
      orgao: "RECEITA" as const,
      descricao: "DEFIS não entregue",
      competencia: String(ano),
      valor: 0,
      situacao: "multa mínima; entregar a declaração",
      origem: "integra" as const,
    })),
  ];
}

/**
 * Busca as obrigações do Simples. `inicio` = AAAAMM a partir do qual a empresa está no Simples
 * (limitado aos últimos 5 anos, prazo decadencial).
 */
export async function buscarObrigacoesSimples(cnpj: string, inicio: string, dataIso: string): Promise<ObrigacoesSimples> {
  const avisos: string[] = [];
  const anoAtual = Number(dataIso.slice(0, 4));
  const ini = inicio > aaaamm(anoAtual - 5, 1) ? inicio : aaaamm(anoAtual - 5, 1);
  const periodos: PeriodoPgdas[] = [];
  for (let ano = Number(ini.slice(0, 4)); ano <= anoAtual; ano++) {
    try {
      const r = await chamar(cnpj, SERVICOS.pgdasdDeclaracoes, { anoCalendario: String(ano) });
      if (r.status === 200) periodos.push(...mapearPgdasd(r.dados));
      else if (r.status !== 204) avisos.push(`PGDAS-D ${ano}: HTTP ${r.status} ${r.mensagens.map((m) => m.texto).join(" ")}`.trim());
    } catch (e) {
      avisos.push(`PGDAS-D ${ano}: ${(e as Error).message}`);
    }
  }
  let defisEntregues: number[] = [];
  try {
    const r = await chamar(cnpj, SERVICOS.defisDeclaracoes, "");
    if (r.status === 200) defisEntregues = mapearDefis(r.dados);
    else avisos.push(`DEFIS: HTTP ${r.status} ${r.mensagens.map((m) => m.texto).join(" ")}`.trim());
  } catch (e) {
    avisos.push(`DEFIS: ${(e as Error).message}`);
  }
  let parcelamentos: ParcelamentoSn[] = [];
  try {
    const r = await chamar(cnpj, SERVICOS.parcsnPedidos, "");
    if (r.status === 200) parcelamentos = mapearParcelamentos(r.dados, "Parcelamento do Simples Nacional");
    else if (r.status !== 204) avisos.push(`Parcelamentos: HTTP ${r.status} ${r.mensagens.map((m) => m.texto).join(" ")}`.trim());
  } catch (e) {
    avisos.push(`Parcelamentos: ${(e as Error).message}`);
  }
  const declarados = periodos.filter((p) => p.declaracoes > 0).map((p) => p.periodo);
  const consultouDefis = !avisos.some((a) => a.startsWith("DEFIS"));
  return {
    periodos: periodos.sort((a, b) => a.periodo.localeCompare(b.periodo)),
    defisEntregues,
    parcelamentos,
    pgdasOmissos: avisos.some((a) => a.startsWith("PGDAS")) ? [] : mesesOmissos(declarados, ini, dataIso),
    defisOmissas: consultouDefis ? anosDefisOmissos(defisEntregues, Number(ini.slice(0, 4)), dataIso) : [],
    dasNaoPagos: periodos.filter((p) => p.dasGerado && p.dasPago === false).map((p) => p.periodo),
    avisos,
  };
}
