import { arred, inssProLabore, irrfProLabore } from "./calculos";
import { valorDebito } from "./mei";
import { FATOR_R_MINIMO, FGTS, parametrosEm, type AnexoSimples, type Parametros, type PartilhaSimples, type TributoSimples } from "./parametros";
import type { Debito, LinhaCusto, SituacaoCadastral } from "./tipos";

/**
 * Motor do Simples Nacional (LC 123/2006).
 *
 * Calcula o DAS por atividade (receitas segregadas), com a partilha de cada tributo,
 * fator R, sublimite de ICMS/ISS, limite de R$ 4,8 milhões, CPP fora do DAS no Anexo IV,
 * receitas com ICMS-ST, PIS/Cofins monofásico, ISS retido e exportação.
 * Compara com o Lucro Presumido e projeta o efeito de IBS e CBS.
 */

/** "FATOR_R": serviço do § 5º-M do art. 18 (Anexo III com fator R ≥ 28%, senão Anexo V). */
export type Enquadramento = AnexoSimples | "FATOR_R";

export interface AtividadeSimples {
  descricao: string;
  enquadramento: Enquadramento;
  /** Receita bruta mensal média desta atividade. */
  receitaMensal: number;
  /** Frações da receita (0 a 1). */
  icmsSt?: number;
  monofasico?: number;
  issRetido?: number;
  exportacao?: number;
  /** Percentuais de presunção no Lucro Presumido. Padrão: 8%/12% comércio e indústria, 32%/32% serviço. */
  presuncaoIrpj?: number;
  presuncaoCsll?: number;
}

export interface FolhaSimples {
  /** Salários mensais dos empregados (sem encargos). */
  salariosMensais: number;
  /** Pró-labore mensal somado de todos os sócios. */
  proLaboreMensal: number;
  /** Quantos sócios recebem pró-labore (para INSS e IRRF por pessoa). */
  socios: number;
  /** Soma 13º e 1/3 de férias na folha anual (fator R e encargos). Padrão: sim. */
  incluirProvisoes?: boolean;
  /** RAT/GILRAT ajustado pelo FAP (fração). Padrão 2%. */
  rat?: number;
}

export interface EntradaSimples {
  dataBase?: string;
  situacao: SituacaoCadastral;
  /** Receita bruta dos 12 meses anteriores (RBT12). Vazio: receita mensal × 12. */
  rbt12?: number;
  /** Meses de atividade, se menos de 12: o RBT12 informado é a receita do período e é proporcionalizado. */
  mesesAtividade?: number;
  atividades: AtividadeSimples[];
  folha: FolhaSimples;
  /** Atividade vedada ao Simples (art. 17)? */
  atividadeVedada?: boolean;
  /** Alíquota do ISS no município, fora do Simples (fração). */
  issMunicipal: number;
  /** Carga efetiva de ICMS no regime normal, sobre a receita de comércio e indústria (fração). */
  icmsEfetivoNormal: number;
  /** Compras e despesas que dão crédito de IBS/CBS, em fração da receita. */
  comprasComCredito: number;
  /** Vendas para empresas, em fração da receita. */
  vendasParaEmpresas: number;
  debitos: Debito[];
  honorarios: { simplesMensal: number; presumidoMensal: number; baixa: number };
}

const TRIBUTOS: TributoSimples[] = ["IRPJ", "CSLL", "COFINS", "PIS", "CPP", "IPI", "ICMS", "ISS"];
const soma = (l: LinhaCusto[]) => arred(l.reduce((s, x) => s + x.valor, 0));
const pct = (v: number, casas = 2) => `${(v * 100).toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas })}%`;
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** RBT12 proporcional no início de atividade: média mensal do período × 12 (art. 18, § 2º). */
export function rbt12Proporcional(receitaPeriodo: number, meses: number): number {
  if (meses <= 0) return 0;
  if (meses >= 12) return receitaPeriodo;
  return arred((receitaPeriodo / meses) * 12);
}

export function receitaMensalTotal(e: EntradaSimples): number {
  return arred(e.atividades.reduce((s, a) => s + a.receitaMensal, 0));
}

export function rbt12De(e: EntradaSimples): number {
  if (e.rbt12 && e.rbt12 > 0) return e.mesesAtividade && e.mesesAtividade < 12 ? rbt12Proporcional(e.rbt12, e.mesesAtividade) : e.rbt12;
  return arred(receitaMensalTotal(e) * 12);
}

/** Folha de 12 meses para o fator R: salários (com 13º e férias), FGTS e pró-labore. CPP fica no DAS. */
export function folha12m(f: FolhaSimples): number {
  const meses = f.incluirProvisoes === false ? 12 : 12 + 1 + 1 / 3;
  const salarios = f.salariosMensais * meses;
  return arred(salarios * (1 + FGTS) + f.proLaboreMensal * 12);
}

export function fatorR(f: FolhaSimples, rbt12: number): number {
  return rbt12 > 0 ? folha12m(f) / rbt12 : 0;
}

export function resolverAnexo(enq: Enquadramento, fr: number): AnexoSimples {
  if (enq !== "FATOR_R") return enq;
  return fr >= FATOR_R_MINIMO ? "III" : "V";
}

export interface FaixaCalculada {
  faixa: number;
  nominal: number;
  deducao: number;
  efetiva: number;
}

export function faixaSimples(rbt12: number, anexo: AnexoSimples, p: Parametros): FaixaCalculada {
  const tabela = p.anexosSimples[anexo];
  const base = Math.max(rbt12, 0);
  let i = tabela.findIndex((f) => base <= f.ate);
  if (i < 0) i = tabela.length - 1; // acima do limite: usa a última faixa só para estimar
  const f = tabela[i];
  const efetiva = base > 0 ? (base * f.aliquota - f.deducao) / base : f.aliquota;
  return { faixa: i + 1, nominal: f.aliquota, deducao: f.deducao, efetiva };
}

/**
 * Percentual efetivo de cada tributo: alíquota efetiva × partilha.
 * ISS efetivo limitado a 5%, com a diferença repassada aos tributos federais na proporção (nota dos Anexos III e IV).
 */
export function partilhaEfetiva(efetiva: number, partilha: PartilhaSimples): Partial<Record<TributoSimples, number>> {
  const r: Partial<Record<TributoSimples, number>> = {};
  for (const t of TRIBUTOS) if (partilha[t]) r[t] = efetiva * partilha[t]!;
  if ((r.ISS ?? 0) > 0.05) {
    const excesso = r.ISS! - 0.05;
    r.ISS = 0.05;
    const federais = TRIBUTOS.filter((t) => t !== "ISS" && t !== "ICMS" && r[t]);
    const base = federais.reduce((s, t) => s + partilha[t]!, 0);
    for (const t of federais) r[t]! += (excesso * partilha[t]!) / base;
  }
  return r;
}

export interface ApuracaoAtividade {
  descricao: string;
  anexo: AnexoSimples;
  receitaMensal: number;
  faixa: FaixaCalculada;
  /** Alíquota efetiva final depois das exclusões (ST, monofásico, ISS retido, exportação, sublimite). */
  aliquotaFinal: number;
  das: number;
  porTributo: Partial<Record<TributoSimples, number>>;
  /** ISS e ICMS pagos fora do DAS (sublimite) e ISS retido pelo tomador. */
  fora: LinhaCusto[];
}

export interface ApuracaoSimples {
  rbt12: number;
  fatorR: number;
  folha12m: number;
  atividades: ApuracaoAtividade[];
  dasMensal: number;
  porTributo: Partial<Record<TributoSimples, number>>;
  foraDoDas: LinhaCusto[];
  acimaSublimite: boolean;
  acimaLimite: boolean;
  alertas: string[];
}

/** Apura o DAS mensal (receitas segregadas por atividade). */
export function apurarSimples(e: EntradaSimples, p: Parametros = parametrosEm(e.dataBase), folha: FolhaSimples = e.folha): ApuracaoSimples {
  const rbt12 = rbt12De(e);
  const fr = fatorR(folha, rbt12);
  const { limite, sublimite } = p.limitesSimples;
  const acimaSublimite = rbt12 > sublimite;
  const acimaLimite = rbt12 > limite;
  const alertas: string[] = [];
  const atividades: ApuracaoAtividade[] = [];
  const total: Partial<Record<TributoSimples, number>> = {};
  const fora: LinhaCusto[] = [];

  for (const a of e.atividades) {
    if (a.receitaMensal <= 0) continue;
    const anexo = resolverAnexo(a.enquadramento, fr);
    const faixa = faixaSimples(rbt12, anexo, p);
    const partilha = p.partilhaSimples[anexo][faixa.faixa - 1];
    const ef = partilhaEfetiva(faixa.efetiva, partilha);
    const st = a.icmsSt ?? 0, mono = a.monofasico ?? 0, ret = a.issRetido ?? 0, exp = a.exportacao ?? 0;
    const porTributo: Partial<Record<TributoSimples, number>> = {};
    const linhasFora: LinhaCusto[] = [];
    const R = a.receitaMensal;
    for (const t of TRIBUTOS) {
      const aliq = ef[t] ?? 0;
      if (!aliq) continue;
      let fracao = 1;
      if (t === "ICMS") fracao -= st + exp;
      if (t === "PIS" || t === "COFINS") fracao -= mono + exp;
      if (t === "IPI") fracao -= exp;
      if (t === "ISS") fracao -= ret + exp;
      if ((t === "ICMS" || t === "ISS") && acimaSublimite) fracao = 0;
      fracao = Math.max(0, Math.min(1, fracao));
      const v = R * aliq * fracao;
      if (v > 0) porTributo[t] = arred(v);
    }
    // Sublimite: ISS e ICMS por fora, pelas regras normais.
    if (acimaSublimite) {
      const temIss = anexo !== "I" && anexo !== "II";
      if (temIss && e.issMunicipal > 0) linhasFora.push({ item: `ISS fora do DAS (sublimite) · ${a.descricao}`, valor: arred(R * (1 - exp) * e.issMunicipal) });
      if (!temIss && e.icmsEfetivoNormal > 0) linhasFora.push({ item: `ICMS fora do DAS (sublimite) · ${a.descricao}`, valor: arred(R * (1 - st - exp) * e.icmsEfetivoNormal) });
    } else if (ret > 0 && ef.ISS) {
      linhasFora.push({ item: `ISS retido pelo tomador · ${a.descricao}`, valor: arred(R * ret * ef.ISS) });
    }
    const das = arred(Object.values(porTributo).reduce((s, v) => s + (v ?? 0), 0));
    for (const [t, v] of Object.entries(porTributo)) total[t as TributoSimples] = arred((total[t as TributoSimples] ?? 0) + (v ?? 0));
    fora.push(...linhasFora);
    atividades.push({ descricao: a.descricao, anexo, receitaMensal: R, faixa, aliquotaFinal: R > 0 ? das / R : 0, das, porTributo, fora: linhasFora });
  }

  // Anexo IV: CPP sobre a folha fora do DAS, na proporção da receita do Anexo IV.
  const receita = receitaMensalTotal(e);
  const recIV = atividades.filter((a) => a.anexo === "IV").reduce((s, a) => s + a.receitaMensal, 0);
  if (recIV > 0 && receita > 0) {
    const prop = recIV / receita;
    const cpp = cppMensal(folha, p, false) * prop;
    if (cpp > 0) fora.push({ item: "CPP (20% + RAT) fora do DAS · Anexo IV", valor: arred(cpp) });
  }

  if (acimaLimite) alertas.push(`RBT12 de ${brl(rbt12)} passa do limite de ${brl(limite)}: a empresa sai do Simples (cálculo apenas estimado).`);
  else if (acimaSublimite) alertas.push(`RBT12 acima do sublimite de ${brl(sublimite)}: ICMS e ISS são recolhidos fora do DAS, pelas regras normais.`);
  if (e.atividades.some((a) => a.enquadramento === "FATOR_R")) {
    alertas.push(
      fr >= FATOR_R_MINIMO
        ? `Fator R de ${pct(fr, 1)}: serviços do § 5º-M tributados no Anexo III.`
        : `Fator R de ${pct(fr, 1)}, abaixo de 28%: serviços do § 5º-M caem no Anexo V.`,
    );
  }
  return {
    rbt12,
    fatorR: fr,
    folha12m: folha12m(folha),
    atividades,
    dasMensal: arred(atividades.reduce((s, a) => s + a.das, 0)),
    porTributo: total,
    foraDoDas: fora,
    acimaSublimite,
    acimaLimite,
    alertas,
  };
}

/** Folha mensal média com provisões (13º e 1/3 de férias). */
function salariosMedios(f: FolhaSimples): number {
  return f.incluirProvisoes === false ? f.salariosMensais : (f.salariosMensais * (12 + 1 + 1 / 3)) / 12;
}

/** CPP patronal: 20% + RAT sobre salários (+ terceiros fora do Simples) e 20% sobre o pró-labore. */
export function cppMensal(f: FolhaSimples, p: Parametros, comTerceiros: boolean): number {
  const rat = f.rat ?? 0.02;
  const sal = salariosMedios(f);
  return arred(sal * (p.presumido.cpp + rat + (comTerceiros ? p.presumido.terceiros : 0)) + f.proLaboreMensal * p.presumido.cpp);
}

/** INSS (11%) e IRRF dos sócios sobre o pró-labore, dividido igualmente entre eles. */
export function encargosSocios(f: FolhaSimples, p: Parametros): { inss: number; irrf: number } {
  const n = Math.max(1, f.socios || 1);
  if (f.proLaboreMensal <= 0) return { inss: 0, irrf: 0 };
  const cada = f.proLaboreMensal / n;
  return { inss: arred(inssProLabore(cada, p) * n), irrf: arred(irrfProLabore(cada, p) * n) };
}

function linhasFolha(f: FolhaSimples, p: Parametros): LinhaCusto[] {
  const l: LinhaCusto[] = [];
  const { inss, irrf } = encargosSocios(f, p);
  if (inss > 0) l.push({ item: "INSS dos sócios sobre o pró-labore (11%)", valor: inss });
  if (irrf > 0) l.push({ item: "IRRF sobre o pró-labore", valor: irrf });
  if (f.salariosMensais > 0) l.push({ item: "FGTS dos empregados (8%, com 13º e férias)", valor: arred(salariosMedios(f) * FGTS) });
  return l;
}

/** Custo mensal no Simples: DAS, tributos fora do DAS, encargos de folha e pró-labore, honorários. */
export function custoMensalSimples(e: EntradaSimples, p: Parametros, folha: FolhaSimples = e.folha): { apuracao: ApuracaoSimples; linhas: LinhaCusto[] } {
  const ap = apurarSimples(e, p, folha);
  const anexos = [...new Set(ap.atividades.map((a) => a.anexo))].join(", ");
  const linhas: LinhaCusto[] = [
    { item: `DAS Simples Nacional (Anexo ${anexos || "-"}, ${pct(ap.dasMensal / Math.max(1, receitaMensalTotal(e)))} da receita)`, valor: ap.dasMensal },
    ...ap.foraDoDas,
    ...linhasFolha(folha, p),
  ];
  if (e.honorarios.simplesMensal > 0) linhas.push({ item: "Honorários contábeis (Simples)", valor: e.honorarios.simplesMensal });
  return { apuracao: ap, linhas };
}

// ---------------- Pró-labore e fator R ----------------

export interface SugestaoProLabore {
  aplicavel: boolean;
  atual: number;
  sugerido: number;
  economiaMensal: number;
  explicacao: string;
}

/**
 * Pró-labore que leva o fator R a 28% (Anexo III) e quanto economiza no mês,
 * já contando o INSS de 11% e o IRRF a mais do sócio.
 */
export function proLaboreOtimo(e: EntradaSimples, p: Parametros = parametrosEm(e.dataBase)): SugestaoProLabore {
  const atual = e.folha.proLaboreMensal;
  const base = { aplicavel: false, atual, sugerido: atual, economiaMensal: 0, explicacao: "" };
  if (!e.atividades.some((a) => a.enquadramento === "FATOR_R" && a.receitaMensal > 0)) {
    return { ...base, explicacao: "Nenhuma atividade sujeita ao fator R: o pró-labore não muda o anexo." };
  }
  const rbt12 = rbt12De(e);
  if (fatorR(e.folha, rbt12) >= FATOR_R_MINIMO) {
    return { ...base, explicacao: `Fator R já está em ${pct(fatorR(e.folha, rbt12), 1)}: a empresa já está no Anexo III.` };
  }
  const semProLabore = folha12m({ ...e.folha, proLaboreMensal: 0 });
  const necessario = Math.max(p.salarioMinimo * Math.max(1, e.folha.socios || 1), (FATOR_R_MINIMO * rbt12 - semProLabore) / 12);
  const sugerido = Math.ceil(necessario / 10 - 1e-9) * 10;
  const folhaNova = { ...e.folha, proLaboreMensal: sugerido };
  const custo = (f: FolhaSimples) => {
    const ap = apurarSimples(e, p, f);
    const s = encargosSocios(f, p);
    return ap.dasMensal + ap.foraDoDas.reduce((x, l) => x + l.valor, 0) + s.inss + s.irrf;
  };
  const economia = arred(custo(e.folha) - custo(folhaNova));
  if (economia <= 0) {
    return { ...base, sugerido, explicacao: `Para chegar a 28% o pró-labore teria de ir a ${brl(sugerido)}/mês, mas o INSS e o IRRF a mais superam a economia no DAS. Manter no Anexo V.` };
  }
  return {
    aplicavel: true,
    atual,
    sugerido,
    economiaMensal: economia,
    explicacao: `Com pró-labore de ${brl(sugerido)}/mês (total dos sócios) o fator R chega a 28% e os serviços vão para o Anexo III. Economia de ${brl(economia)}/mês já descontados INSS e IRRF. O fator R usa a folha dos últimos 12 meses: o efeito pleno vem quando a média dos 12 meses atingir 28%.`,
  };
}

// ---------------- Lucro Presumido ----------------

export function presuncaoPadrao(enq: Enquadramento): { irpj: number; csll: number } {
  return enq === "I" || enq === "II" ? { irpj: 0.08, csll: 0.12 } : { irpj: 0.32, csll: 0.32 };
}

export interface ApuracaoPresumido {
  linhas: LinhaCusto[];
  tributos: { irpj: number; adicional: number; csll: number; pis: number; cofins: number; iss: number; icms: number; cpp: number };
  alertas: string[];
}

/** Custo mensal médio no Lucro Presumido (PIS/Cofins cumulativos, ISS e ICMS normais, CPP sobre a folha). */
export function custoMensalPresumido(e: EntradaSimples, p: Parametros = parametrosEm(e.dataBase)): ApuracaoPresumido {
  const r = p.presumido;
  const receita = receitaMensalTotal(e);
  // Majoração da LC 224/2025: sobre a parte da receita anual acima do limite.
  const excedente = r.majoracao ? Math.max(0, receita * 12 - r.majoracao.limiteAnual) / (receita * 12 || 1) : 0;
  let baseIrpj = 0, baseCsll = 0, pis = 0, cofins = 0, iss = 0, icms = 0;
  for (const a of e.atividades) {
    const R = a.receitaMensal;
    if (R <= 0) continue;
    const pad = presuncaoPadrao(a.enquadramento);
    const pi = a.presuncaoIrpj ?? pad.irpj, pc = a.presuncaoCsll ?? pad.csll;
    const fatorIrpj = 1 + excedente * (r.majoracao?.acrescimo ?? 0);
    const fatorCsll = r.majoracao?.aplicaCsll ? fatorIrpj : 1;
    baseIrpj += R * pi * fatorIrpj;
    baseCsll += R * pc * fatorCsll;
    const exp = a.exportacao ?? 0, mono = a.monofasico ?? 0;
    pis += R * Math.max(0, 1 - exp - mono) * r.pis;
    cofins += R * Math.max(0, 1 - exp - mono) * r.cofins;
    if (a.enquadramento === "I" || a.enquadramento === "II") icms += R * Math.max(0, 1 - exp - (a.icmsSt ?? 0)) * e.icmsEfetivoNormal;
    else iss += R * Math.max(0, 1 - exp) * e.issMunicipal;
  }
  const irpj = baseIrpj * r.irpj;
  const adicional = Math.max(0, baseIrpj - r.limiteAdicionalMensal) * r.adicionalIrpj;
  const csll = baseCsll * r.csll;
  const cpp = cppMensal(e.folha, p, true);
  const t = { irpj: arred(irpj), adicional: arred(adicional), csll: arred(csll), pis: arred(pis), cofins: arred(cofins), iss: arred(iss), icms: arred(icms), cpp };
  const linhas: LinhaCusto[] = [
    { item: "IRPJ (15% sobre a presunção)", valor: t.irpj },
    ...(t.adicional > 0 ? [{ item: "Adicional do IRPJ (10%)", valor: t.adicional }] : []),
    { item: "CSLL (9% sobre a presunção)", valor: t.csll },
    { item: "PIS cumulativo (0,65%)", valor: t.pis },
    { item: "Cofins cumulativa (3%)", valor: t.cofins },
    ...(t.iss > 0 ? [{ item: `ISS municipal (${pct(e.issMunicipal)})`, valor: t.iss }] : []),
    ...(t.icms > 0 ? [{ item: `ICMS no regime normal (carga efetiva ${pct(e.icmsEfetivoNormal)})`, valor: t.icms }] : []),
    ...(t.cpp > 0 ? [{ item: "CPP patronal (20% + RAT + terceiros nos salários, 20% no pró-labore)", valor: t.cpp }] : []),
    ...linhasFolha(e.folha, p),
  ];
  if (e.honorarios.presumidoMensal > 0) linhas.push({ item: "Honorários contábeis (Lucro Presumido)", valor: e.honorarios.presumidoMensal });
  const alertas: string[] = [];
  if (e.atividades.some((a) => (a.enquadramento === "I" || a.enquadramento === "II") && a.receitaMensal > 0)) {
    alertas.push(`ICMS estimado pela carga efetiva informada (${pct(e.icmsEfetivoNormal)} da receita). Ajuste conforme o estado, os créditos e os benefícios do cliente.`);
  }
  if (e.atividades.some((a) => a.enquadramento === "II" && a.receitaMensal > 0)) alertas.push("IPI da indústria fora do Simples não entra na estimativa.");
  if (excedente > 0) alertas.push("Receita acima de R$ 5 milhões no ano: presunção majorada em 10% sobre o excedente (LC 224/2025).");
  alertas.push("PIS e Cofins no regime cumulativo, sem créditos. Lucro distribuído aos sócios além da presunção exige escrituração contábil.");
  return { linhas, tributos: t, alertas };
}

// ---------------- Débitos e obrigações do Simples ----------------

export function totalDebitosSimples(debitos: Debito[], p: Parametros): number {
  return arred(debitos.reduce((s, d) => s + valorDebito(d, p), 0));
}

/** Débitos que impedem a permanência no Simples (art. 17, V): sem exigibilidade suspensa e fora de parcelamento. */
export function debitosImpeditivos(debitos: Debito[]): Debito[] {
  return debitos.filter((d) => {
    const s = (d.situacao ?? "").toUpperCase();
    if (d.tipo === "PARCELAMENTO" || d.tipo === "PGDAS_OMISSA" || d.tipo === "DEFIS_OMISSA") return false;
    return !/SUSPENS|PARCELAMENTO|PARCELAD|NEGOCIAD|SISPAR/.test(s) && d.valor > 0;
  });
}

// ---------------- Cenários ----------------

export type CodigoCenarioSimples = "A" | "B" | "C" | "D";

export interface CenarioSimples {
  codigo: CodigoCenarioSimples;
  titulo: string;
  viavel: boolean;
  continuaOperando: boolean;
  regularizacao: number;
  custoMensal: LinhaCusto[];
  custoUnico: LinhaCusto[];
  custo12m: number;
  desembolso12m: number;
  regime?: string;
  alertas: string[];
}

export interface ResultadoSimples {
  parametros: Parametros;
  apuracao: ApuracaoSimples;
  presumido: ApuracaoPresumido;
  proLabore: SugestaoProLabore;
  totalDebitos: number;
  impeditivos: number;
  cenarios: CenarioSimples[];
  recomendado?: CodigoCenarioSimples;
  justificativa: string;
  reforma: ProjecaoReforma[];
}

export function analisarSimples(e: EntradaSimples): ResultadoSimples {
  const p = parametrosEm(e.dataBase);
  const debitos = totalDebitosSimples(e.debitos, p);
  const imped = debitosImpeditivos(e.debitos);
  const valorImped = arred(imped.reduce((s, d) => s + d.valor, 0));
  const { limite, tolerancia } = p.limitesSimples;
  const receitaAnual = receitaMensalTotal(e) * 12;

  // A. Permanecer no Simples como está
  const simples = custoMensalSimples(e, p);
  const alertasA = [...simples.apuracao.alertas];
  let viavelSimples = !e.atividadeVedada;
  if (e.atividadeVedada) alertasA.push("Atividade vedada ao Simples (art. 17 da LC 123/2006).");
  if (receitaAnual > limite * (1 + tolerancia)) {
    viavelSimples = false;
    alertasA.push(`Receita anual projetada acima de ${brl(limite * (1 + tolerancia))}: exclusão retroativa ao início do ano.`);
  } else if (receitaAnual > limite) {
    viavelSimples = false;
    alertasA.push("Receita anual acima de R$ 4,8 milhões, dentro dos 20%: exclusão a partir de janeiro do ano seguinte.");
  }
  if (valorImped > 0) alertasA.push(`${brl(valorImped)} em débitos sem exigibilidade suspensa: pagar ou parcelar para evitar o termo de exclusão (art. 17, V).`);
  const omissoes = e.debitos.filter((d) => d.tipo === "PGDAS_OMISSA" || d.tipo === "DEFIS_OMISSA").length;
  if (omissoes) alertasA.push(`${omissoes} declaração(ões) do Simples não entregue(s): transmitir PGDAS-D e DEFIS em atraso.`);
  if (e.situacao === "INAPTA") alertasA.push("CNPJ inapto: entregar as declarações omissas para reativar.");
  const mA = soma(simples.linhas);
  const a: CenarioSimples = {
    codigo: "A",
    titulo: "Regularizar e permanecer no Simples",
    viavel: viavelSimples,
    continuaOperando: true,
    regularizacao: debitos,
    custoMensal: simples.linhas,
    custoUnico: [],
    custo12m: arred(mA * 12),
    desembolso12m: arred(debitos + mA * 12),
    regime: `Simples Nacional`,
    alertas: alertasA,
  };

  // B. Permanecer no Simples com o pró-labore do fator R
  const pl = proLaboreOtimo(e, p);
  const cenarios: CenarioSimples[] = [a];
  if (pl.aplicavel) {
    const otimo = custoMensalSimples(e, p, { ...e.folha, proLaboreMensal: pl.sugerido });
    const mB = soma(otimo.linhas);
    cenarios.push({
      codigo: "B",
      titulo: "Permanecer no Simples com pró-labore pelo fator R",
      viavel: viavelSimples,
      continuaOperando: true,
      regularizacao: debitos,
      custoMensal: otimo.linhas,
      custoUnico: [],
      custo12m: arred(mB * 12),
      desembolso12m: arred(debitos + mB * 12),
      regime: "Simples Nacional, Anexo III pelo fator R",
      alertas: [pl.explicacao],
    });
  }

  // C. Migrar para o Lucro Presumido (opção em janeiro, pelo 1º DARF)
  const pres = custoMensalPresumido(e, p);
  const mC = soma(pres.linhas);
  const ano = Number(p.data.slice(0, 4));
  cenarios.push({
    codigo: "C",
    titulo: "Migrar para o Lucro Presumido",
    viavel: receitaAnual <= 78_000_000,
    continuaOperando: true,
    regularizacao: debitos,
    custoMensal: pres.linhas,
    custoUnico: [],
    custo12m: arred(mC * 12),
    desembolso12m: arred(debitos + mC * 12),
    regime: "Lucro Presumido",
    alertas: [
      `A saída voluntária do Simples é pedida até o último dia útil de janeiro e vale para o ano todo: próxima janela em janeiro de ${p.data.slice(5, 7) === "01" ? ano : ano + 1}.`,
      ...pres.alertas,
    ],
  });

  // D. Regularizar e dar baixa: só o honorário.
  const unicoD: LinhaCusto[] = [{ item: "Honorário de baixa", valor: e.honorarios.baixa }];
  cenarios.push({
    codigo: "D",
    titulo: "Regularizar e dar baixa na empresa",
    viavel: true,
    continuaOperando: false,
    regularizacao: debitos,
    custoMensal: [],
    custoUnico: unicoD,
    custo12m: soma(unicoD),
    desembolso12m: arred(debitos + soma(unicoD)),
    alertas: ["Indicado quando o cliente vai encerrar a atividade. Depois da baixa não há custo mensal."],
  });

  const candidatos = cenarios.filter((c) => c.viavel && c.continuaOperando).sort((x, y) => x.custo12m - y.custo12m);
  const melhor = candidatos[0];
  let justificativa = "Nenhum caminho de continuidade é viável com os dados informados.";
  if (melhor) {
    justificativa = `Para continuar operando, o caminho ${melhor.codigo} tem o menor custo de impostos, encargos e honorários em 12 meses: ${brl(melhor.custo12m)}.`;
    const segundo = candidatos[1];
    if (segundo) justificativa += ` Diferença de ${brl(segundo.custo12m - melhor.custo12m)} para o caminho ${segundo.codigo}.`;
    if (debitos > 0) justificativa += ` A dívida de ${brl(debitos)} precisa ser regularizada em qualquer caminho.`;
  }

  return {
    parametros: p,
    apuracao: simples.apuracao,
    presumido: pres,
    proLabore: pl,
    totalDebitos: debitos,
    impeditivos: valorImped,
    cenarios,
    recomendado: melhor?.codigo,
    justificativa,
    reforma: projetarReforma(e),
  };
}

// ---------------- Reforma Tributária (IBS e CBS) ----------------

export interface ProjecaoReforma {
  ano: number;
  cbs: number;
  ibs: number;
  /** Simples "puro": IBS e CBS dentro do DAS (DAS mensal igual ao de hoje). */
  simplesPuro: number;
  /** Crédito de IBS/CBS que o comprador aproveita por mês no Simples puro. */
  creditoComprador: number;
  /** Simples "híbrido": IBS e CBS por fora, com créditos das compras. */
  simplesHibrido?: number;
  /** Crédito integral transferido ao comprador no híbrido. */
  creditoCompradorHibrido?: number;
  presumido: number;
}

/**
 * Projeção mensal de tributos sobre o faturamento (sem folha e honorários) em cada ano da transição.
 * Simplificação: receita, compras e alíquotas do Simples iguais às de hoje; IBS/CBS por fora sobre (receita − compras com crédito).
 */
export function projetarReforma(e: EntradaSimples, anos = [2026, 2027, 2029, 2031, 2033]): ProjecaoReforma[] {
  const r: ProjecaoReforma[] = [];
  const receita = receitaMensalTotal(e);
  const baseIva = Math.max(0, receita * (1 - e.comprasComCredito));
  for (const ano of anos) {
    const p = parametrosEm(`${ano}-07-01`);
    const etapa = p.reforma;
    if (!etapa) continue;
    const ap = apurarSimples(e, p);
    const t = ap.porTributo;
    const pisCofins = (t.PIS ?? 0) + (t.COFINS ?? 0);
    const icmsIss = (t.ICMS ?? 0) + (t.ISS ?? 0);
    const foraSimples = ap.foraDoDas.filter((l) => !l.item.startsWith("CPP")).reduce((s, l) => s + l.valor, 0);
    const simplesPuro = arred(ap.dasMensal + foraSimples);
    const parteIbsDas = icmsIss * (1 - etapa.icmsIssRestante);
    const creditoComprador = etapa.apenasTeste ? 0 : arred((pisCofins + parteIbsDas) * e.vendasParaEmpresas);

    const pres = custoMensalPresumido(e, p).tributos;
    const ivaFora = baseIva * (etapa.cbs + etapa.ibs);
    const presumido = etapa.pisCofinsExiste
      ? arred(pres.irpj + pres.adicional + pres.csll + pres.pis + pres.cofins + pres.iss + pres.icms)
      : arred(pres.irpj + pres.adicional + pres.csll + (pres.iss + pres.icms) * etapa.icmsIssRestante + ivaFora);

    const item: ProjecaoReforma = { ano, cbs: etapa.cbs, ibs: etapa.ibs, simplesPuro, creditoComprador, presumido };
    if (!etapa.pisCofinsExiste) {
      item.simplesHibrido = arred(simplesPuro - pisCofins - parteIbsDas + ivaFora);
      item.creditoCompradorHibrido = arred(receita * e.vendasParaEmpresas * (etapa.cbs + etapa.ibs));
    }
    r.push(item);
  }
  return r;
}
