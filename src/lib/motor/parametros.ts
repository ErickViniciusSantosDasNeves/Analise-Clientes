/**
 * Parâmetros legais com data de vigência.
 *
 * Cada valor é uma lista de versões. O app usa a versão vigente na data da
 * análise, então uma lei nova entra como uma linha nova (com a data em que
 * passa a valer e a norma), sem apagar as anteriores.
 *
 * Valores marcados com "CONFERIR" devem ser validados pelo contador.
 */

export interface Versao<T> {
  /** Data (AAAA-MM-DD) a partir da qual o valor vale. */
  vigenteDesde: string;
  /** Norma que fixou o valor. */
  fonte: string;
  valor: T;
}

export interface FaixaSimples {
  ate: number;
  aliquota: number;
  deducao: number;
}

export type AnexoSimples = "I" | "II" | "III" | "IV" | "V";
export type TributoSimples = "IRPJ" | "CSLL" | "COFINS" | "PIS" | "CPP" | "IPI" | "ICMS" | "ISS";
/** Percentual de cada tributo dentro do DAS, por faixa (soma 1 em cada faixa). */
export type PartilhaSimples = Partial<Record<TributoSimples, number>>;

export interface LimitesSimples {
  /** Receita bruta anual máxima da EPP. */
  limite: number;
  /** Acima dele, ICMS e ISS saem do DAS. */
  sublimite: number;
  /** Excesso tolerado antes de a exclusão (ou o sublimite) ter efeito retroativo. */
  tolerancia: number;
}

export interface RegrasPresumido {
  irpj: number;
  adicionalIrpj: number;
  /** Base trimestral isenta do adicional, convertida em mês. */
  limiteAdicionalMensal: number;
  csll: number;
  pis: number;
  cofins: number;
  /** CPP patronal sobre folha e pró-labore. */
  cpp: number;
  /** Outras entidades (terceiros) sobre a folha de empregados. */
  terceiros: number;
  /** LC 224/2025: acréscimo nos percentuais de presunção sobre a receita que passar do limite anual. */
  majoracao?: { limiteAnual: number; acrescimo: number; aplicaCsll: boolean };
}

export interface TabelaIrpf {
  faixas: { ate: number; aliquota: number; deducao: number }[];
  descontoSimplificado: number;
  /** Redução mensal da Lei 15.270/2025 (ausente antes de 2026). */
  reducao?: { isencaoAte: number; reducaoMaxima: number; faixaFinal: number; constante: number; fator: number };
}

export interface EtapaReforma {
  /** Alíquota de CBS (federal) em fração. */
  cbs: number;
  /** Alíquota de IBS (estados e municípios) em fração. */
  ibs: number;
  /** Quanto do ICMS e do ISS ainda é cobrado (1 = integral, 0 = extinto). */
  icmsIssRestante: number;
  pisCofinsExiste: boolean;
  /** Ano de teste em que o valor é compensável e o Simples não recolhe. */
  apenasTeste?: boolean;
}

/**
 * Alíquotas de referência estimadas pelo governo para o regime pleno (CONFERIR):
 * serão fixadas por resolução do Senado. Usadas só para projeção.
 */
export const REFERENCIA_REFORMA = { cbs: 0.088, ibs: 0.177 };

export const HISTORICO = {
  salarioMinimo: [
    { vigenteDesde: "2025-01-01", fonte: "Decreto 12.342/2024", valor: 1518.0 },
    { vigenteDesde: "2026-01-01", fonte: "Decreto de reajuste 2026 (CONFERIR número)", valor: 1621.0 },
  ] as Versao<number>[],

  tetoInss: [
    { vigenteDesde: "2025-01-01", fonte: "Portaria Interministerial MPS/MF 6/2025", valor: 8157.41 },
    { vigenteDesde: "2026-01-01", fonte: "Portaria Interministerial de 2026 (CONFERIR valor e número)", valor: 8475.55 },
  ] as Versao<number>[],

  limiteMei: [{ vigenteDesde: "2018-01-01", fonte: "LC 123/2006, art. 18-A, redação da LC 155/2016", valor: 81000 }] as Versao<number>[],

  anexosSimples: [
    {
      vigenteDesde: "2018-01-01",
      fonte: "LC 123/2006, Anexos I a V, redação da LC 155/2016",
      valor: {
        IV: [
          { ate: 180000, aliquota: 0.045, deducao: 0 },
          { ate: 360000, aliquota: 0.09, deducao: 8100 },
          { ate: 720000, aliquota: 0.102, deducao: 12420 },
          { ate: 1800000, aliquota: 0.14, deducao: 39780 },
          { ate: 3600000, aliquota: 0.22, deducao: 183780 },
          { ate: 4800000, aliquota: 0.33, deducao: 828000 },
        ],
        I: [
          { ate: 180000, aliquota: 0.04, deducao: 0 },
          { ate: 360000, aliquota: 0.073, deducao: 5940 },
          { ate: 720000, aliquota: 0.095, deducao: 13860 },
          { ate: 1800000, aliquota: 0.107, deducao: 22500 },
          { ate: 3600000, aliquota: 0.143, deducao: 87300 },
          { ate: 4800000, aliquota: 0.19, deducao: 378000 },
        ],
        II: [
          { ate: 180000, aliquota: 0.045, deducao: 0 },
          { ate: 360000, aliquota: 0.078, deducao: 5940 },
          { ate: 720000, aliquota: 0.1, deducao: 13860 },
          { ate: 1800000, aliquota: 0.112, deducao: 22500 },
          { ate: 3600000, aliquota: 0.147, deducao: 85500 },
          { ate: 4800000, aliquota: 0.3, deducao: 720000 },
        ],
        III: [
          { ate: 180000, aliquota: 0.06, deducao: 0 },
          { ate: 360000, aliquota: 0.112, deducao: 9360 },
          { ate: 720000, aliquota: 0.135, deducao: 17640 },
          { ate: 1800000, aliquota: 0.16, deducao: 35640 },
          { ate: 3600000, aliquota: 0.21, deducao: 125640 },
          { ate: 4800000, aliquota: 0.33, deducao: 648000 },
        ],
        V: [
          { ate: 180000, aliquota: 0.155, deducao: 0 },
          { ate: 360000, aliquota: 0.18, deducao: 4500 },
          { ate: 720000, aliquota: 0.195, deducao: 9900 },
          { ate: 1800000, aliquota: 0.205, deducao: 17100 },
          { ate: 3600000, aliquota: 0.23, deducao: 62100 },
          { ate: 4800000, aliquota: 0.305, deducao: 540000 },
        ],
      },
    },
  ] as Versao<Record<AnexoSimples, FaixaSimples[]>>[],

  /**
   * Partilha dos tributos dentro do DAS, faixa a faixa (Anexos da LC 123/2006).
   * Usada no sublimite, nas receitas com ST, monofásico, ISS retido e exportação, e na Reforma.
   */
  partilhaSimples: [
    {
      vigenteDesde: "2018-01-01",
      fonte: "LC 123/2006, Anexos I a V (percentuais de repartição), redação da LC 155/2016",
      valor: {
        I: [
          { IRPJ: 0.055, CSLL: 0.035, COFINS: 0.1274, PIS: 0.0276, CPP: 0.415, ICMS: 0.34 },
          { IRPJ: 0.055, CSLL: 0.035, COFINS: 0.1274, PIS: 0.0276, CPP: 0.415, ICMS: 0.34 },
          { IRPJ: 0.055, CSLL: 0.035, COFINS: 0.1274, PIS: 0.0276, CPP: 0.42, ICMS: 0.335 },
          { IRPJ: 0.055, CSLL: 0.035, COFINS: 0.1274, PIS: 0.0276, CPP: 0.42, ICMS: 0.335 },
          { IRPJ: 0.055, CSLL: 0.035, COFINS: 0.1274, PIS: 0.0276, CPP: 0.42, ICMS: 0.335 },
          { IRPJ: 0.135, CSLL: 0.1, COFINS: 0.2827, PIS: 0.0613, CPP: 0.421 },
        ],
        II: [
          { IRPJ: 0.055, CSLL: 0.035, COFINS: 0.1151, PIS: 0.0249, CPP: 0.375, IPI: 0.075, ICMS: 0.32 },
          { IRPJ: 0.055, CSLL: 0.035, COFINS: 0.1151, PIS: 0.0249, CPP: 0.375, IPI: 0.075, ICMS: 0.32 },
          { IRPJ: 0.055, CSLL: 0.035, COFINS: 0.1151, PIS: 0.0249, CPP: 0.375, IPI: 0.075, ICMS: 0.32 },
          { IRPJ: 0.055, CSLL: 0.035, COFINS: 0.1151, PIS: 0.0249, CPP: 0.375, IPI: 0.075, ICMS: 0.32 },
          { IRPJ: 0.055, CSLL: 0.035, COFINS: 0.1151, PIS: 0.0249, CPP: 0.375, IPI: 0.075, ICMS: 0.32 },
          { IRPJ: 0.085, CSLL: 0.075, COFINS: 0.2096, PIS: 0.0454, CPP: 0.235, IPI: 0.35 },
        ],
        III: [
          { IRPJ: 0.04, CSLL: 0.035, COFINS: 0.1282, PIS: 0.0278, CPP: 0.434, ISS: 0.335 },
          { IRPJ: 0.04, CSLL: 0.035, COFINS: 0.1405, PIS: 0.0305, CPP: 0.434, ISS: 0.32 },
          { IRPJ: 0.04, CSLL: 0.035, COFINS: 0.1364, PIS: 0.0296, CPP: 0.434, ISS: 0.325 },
          { IRPJ: 0.04, CSLL: 0.035, COFINS: 0.1364, PIS: 0.0296, CPP: 0.434, ISS: 0.325 },
          { IRPJ: 0.04, CSLL: 0.035, COFINS: 0.1282, PIS: 0.0278, CPP: 0.434, ISS: 0.335 },
          { IRPJ: 0.35, CSLL: 0.15, COFINS: 0.1603, PIS: 0.0347, CPP: 0.305 },
        ],
        IV: [
          { IRPJ: 0.188, CSLL: 0.152, COFINS: 0.1767, PIS: 0.0383, ISS: 0.445 },
          { IRPJ: 0.198, CSLL: 0.152, COFINS: 0.2055, PIS: 0.0445, ISS: 0.4 },
          { IRPJ: 0.208, CSLL: 0.152, COFINS: 0.1973, PIS: 0.0427, ISS: 0.4 },
          { IRPJ: 0.178, CSLL: 0.192, COFINS: 0.189, PIS: 0.041, ISS: 0.4 },
          { IRPJ: 0.188, CSLL: 0.192, COFINS: 0.1808, PIS: 0.0392, ISS: 0.4 },
          { IRPJ: 0.535, CSLL: 0.215, COFINS: 0.2055, PIS: 0.0445 },
        ],
        V: [
          { IRPJ: 0.25, CSLL: 0.15, COFINS: 0.141, PIS: 0.0305, CPP: 0.2885, ISS: 0.14 },
          { IRPJ: 0.23, CSLL: 0.15, COFINS: 0.141, PIS: 0.0305, CPP: 0.2785, ISS: 0.17 },
          { IRPJ: 0.24, CSLL: 0.15, COFINS: 0.1492, PIS: 0.0323, CPP: 0.2385, ISS: 0.19 },
          { IRPJ: 0.21, CSLL: 0.15, COFINS: 0.1574, PIS: 0.0341, CPP: 0.2385, ISS: 0.21 },
          { IRPJ: 0.23, CSLL: 0.125, COFINS: 0.141, PIS: 0.0305, CPP: 0.2385, ISS: 0.235 },
          { IRPJ: 0.35, CSLL: 0.155, COFINS: 0.1644, PIS: 0.0356, CPP: 0.295 },
        ],
      },
    },
  ] as Versao<Record<AnexoSimples, PartilhaSimples[]>>[],

  limitesSimples: [
    { vigenteDesde: "2018-01-01", fonte: "LC 123/2006, arts. 3º, 13-A e 19, redação da LC 155/2016", valor: { limite: 4800000, sublimite: 3600000, tolerancia: 0.2 } },
  ] as Versao<LimitesSimples>[],

  presumido: [
    {
      vigenteDesde: "2015-01-01",
      fonte: "Lei 9.249/1995, Lei 9.430/1996, Lei 9.718/1998 (PIS/Cofins cumulativos), Lei 8.212/1991 (CPP)",
      valor: { irpj: 0.15, adicionalIrpj: 0.1, limiteAdicionalMensal: 20000, csll: 0.09, pis: 0.0065, cofins: 0.03, cpp: 0.2, terceiros: 0.058 },
    },
    {
      vigenteDesde: "2026-01-01",
      fonte: "LC 224/2025: presunção do IRPJ +10% sobre a receita acima de R$ 5 milhões no ano (CONFERIR)",
      valor: { irpj: 0.15, adicionalIrpj: 0.1, limiteAdicionalMensal: 20000, csll: 0.09, pis: 0.0065, cofins: 0.03, cpp: 0.2, terceiros: 0.058, majoracao: { limiteAnual: 5000000, acrescimo: 0.1, aplicaCsll: false } },
    },
    {
      vigenteDesde: "2026-04-01",
      fonte: "LC 224/2025: presunção do IRPJ e da CSLL +10% sobre a receita acima de R$ 5 milhões no ano; CSLL após a noventena (CONFERIR)",
      valor: { irpj: 0.15, adicionalIrpj: 0.1, limiteAdicionalMensal: 20000, csll: 0.09, pis: 0.0065, cofins: 0.03, cpp: 0.2, terceiros: 0.058, majoracao: { limiteAnual: 5000000, acrescimo: 0.1, aplicaCsll: true } },
    },
  ] as Versao<RegrasPresumido>[],

  /** Multas mínimas por declaração do Simples não entregue. */
  multasSimples: [
    { vigenteDesde: "2018-01-01", fonte: "LC 123/2006, art. 38-A (PGDAS-D) e art. 38 (DEFIS) (CONFERIR)", valor: { pgdasMensal: 50, defisAnual: 200 } },
  ] as Versao<{ pgdasMensal: number; defisAnual: number }>[],

  /** Transição da Reforma Tributária (EC 132/2023 e LC 214/2025). */
  reforma: [
    { vigenteDesde: "2026-01-01", fonte: "LC 214/2025: ano de teste (CBS 0,9% e IBS 0,1%, compensáveis)", valor: { cbs: 0.009, ibs: 0.001, icmsIssRestante: 1, pisCofinsExiste: true, apenasTeste: true } },
    { vigenteDesde: "2027-01-01", fonte: "LC 214/2025: CBS plena (−0,1 p.p.), IBS 0,1%, fim do PIS/Cofins", valor: { cbs: REFERENCIA_REFORMA.cbs - 0.001, ibs: 0.001, icmsIssRestante: 1, pisCofinsExiste: false } },
    { vigenteDesde: "2029-01-01", fonte: "LC 214/2025: ICMS e ISS reduzidos a 90%, IBS a 10%", valor: { cbs: REFERENCIA_REFORMA.cbs, ibs: REFERENCIA_REFORMA.ibs * 0.1, icmsIssRestante: 0.9, pisCofinsExiste: false } },
    { vigenteDesde: "2030-01-01", fonte: "LC 214/2025: ICMS e ISS a 80%, IBS a 20%", valor: { cbs: REFERENCIA_REFORMA.cbs, ibs: REFERENCIA_REFORMA.ibs * 0.2, icmsIssRestante: 0.8, pisCofinsExiste: false } },
    { vigenteDesde: "2031-01-01", fonte: "LC 214/2025: ICMS e ISS a 70%, IBS a 30%", valor: { cbs: REFERENCIA_REFORMA.cbs, ibs: REFERENCIA_REFORMA.ibs * 0.3, icmsIssRestante: 0.7, pisCofinsExiste: false } },
    { vigenteDesde: "2032-01-01", fonte: "LC 214/2025: ICMS e ISS a 60%, IBS a 40%", valor: { cbs: REFERENCIA_REFORMA.cbs, ibs: REFERENCIA_REFORMA.ibs * 0.4, icmsIssRestante: 0.6, pisCofinsExiste: false } },
    { vigenteDesde: "2033-01-01", fonte: "LC 214/2025: IBS pleno, fim do ICMS e do ISS", valor: { cbs: REFERENCIA_REFORMA.cbs, ibs: REFERENCIA_REFORMA.ibs, icmsIssRestante: 0, pisCofinsExiste: false } },
  ] as Versao<EtapaReforma>[],

  irpf: [
    {
      vigenteDesde: "2025-05-01",
      fonte: "Lei 15.191/2025 (tabela progressiva mensal)",
      valor: {
        faixas: [
          { ate: 2428.8, aliquota: 0, deducao: 0 },
          { ate: 2826.65, aliquota: 0.075, deducao: 182.16 },
          { ate: 3751.05, aliquota: 0.15, deducao: 394.16 },
          { ate: 4664.68, aliquota: 0.225, deducao: 675.49 },
          { ate: Infinity, aliquota: 0.275, deducao: 908.73 },
        ],
        descontoSimplificado: 607.2,
      },
    },
    {
      vigenteDesde: "2026-01-01",
      fonte: "Lei 15.270/2025 (redução até R$ 5.000 e parcial até R$ 7.350) (CONFERIR)",
      valor: {
        faixas: [
          { ate: 2428.8, aliquota: 0, deducao: 0 },
          { ate: 2826.65, aliquota: 0.075, deducao: 182.16 },
          { ate: 3751.05, aliquota: 0.15, deducao: 394.16 },
          { ate: 4664.68, aliquota: 0.225, deducao: 675.49 },
          { ate: Infinity, aliquota: 0.275, deducao: 908.73 },
        ],
        descontoSimplificado: 607.2,
        reducao: { isencaoAte: 5000, reducaoMaxima: 312.89, faixaFinal: 7350, constante: 978.62, fator: 0.133145 },
      },
    },
  ] as Versao<TabelaIrpf>[],
};

/** Regras que não mudam com frequência (alíquotas fixas em lei). */
export const MEI_REGRAS = {
  toleranciaExcesso: 0.2,
  aliquotaInss: 0.05,
  icmsMensal: 1.0,
  issMensal: 5.0,
  multaMinimaDasn: 50.0,
  cppEmpregado: 0.03,
  parcelamentoMaxParcelas: 60,
  parcelamentoParcelaMinima: 50.0,
};
export const FGTS = 0.08;
export const FATOR_R_MINIMO = 0.28;
export const ALIQUOTA_INSS_PRO_LABORE = 0.11;

function vigente<T>(versoes: Versao<T>[], data: string): Versao<T> {
  const ordenadas = [...versoes].sort((a, b) => a.vigenteDesde.localeCompare(b.vigenteDesde));
  const v = ordenadas.filter((x) => x.vigenteDesde <= data).at(-1) ?? ordenadas[0];
  return v;
}

export interface Parametros {
  data: string;
  salarioMinimo: number;
  tetoInss: number;
  limiteMei: number;
  anexosSimples: Record<AnexoSimples, FaixaSimples[]>;
  partilhaSimples: Record<AnexoSimples, PartilhaSimples[]>;
  limitesSimples: LimitesSimples;
  presumido: RegrasPresumido;
  multasSimples: { pgdasMensal: number; defisAnual: number };
  irpf: TabelaIrpf;
  /** Etapa da Reforma Tributária (antes de 2026: sem IBS/CBS). */
  reforma?: EtapaReforma;
  /** Norma e vigência usadas, para mostrar no relatório. */
  fontes: { item: string; fonte: string; vigenteDesde: string }[];
}

export function hojeIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Parâmetros vigentes na data informada (AAAA-MM-DD). */
export function parametrosEm(data: string = hojeIso()): Parametros {
  const sm = vigente(HISTORICO.salarioMinimo, data);
  const teto = vigente(HISTORICO.tetoInss, data);
  const lim = vigente(HISTORICO.limiteMei, data);
  const sn = vigente(HISTORICO.anexosSimples, data);
  const ir = vigente(HISTORICO.irpf, data);
  const pt = vigente(HISTORICO.partilhaSimples, data);
  const ls = vigente(HISTORICO.limitesSimples, data);
  const pr = vigente(HISTORICO.presumido, data);
  const ms = vigente(HISTORICO.multasSimples, data);
  const rf = data >= HISTORICO.reforma[0].vigenteDesde ? vigente(HISTORICO.reforma, data) : undefined;
  return {
    data,
    salarioMinimo: sm.valor,
    tetoInss: teto.valor,
    limiteMei: lim.valor,
    anexosSimples: sn.valor,
    partilhaSimples: pt.valor,
    limitesSimples: ls.valor,
    presumido: pr.valor,
    multasSimples: ms.valor,
    irpf: ir.valor,
    reforma: rf?.valor,
    fontes: [
      { item: "Salário mínimo", fonte: sm.fonte, vigenteDesde: sm.vigenteDesde },
      { item: "Teto do INSS", fonte: teto.fonte, vigenteDesde: teto.vigenteDesde },
      { item: "Limite do MEI", fonte: lim.fonte, vigenteDesde: lim.vigenteDesde },
      { item: "Tabelas do Simples", fonte: sn.fonte, vigenteDesde: sn.vigenteDesde },
      { item: "Partilha dos tributos no DAS", fonte: pt.fonte, vigenteDesde: pt.vigenteDesde },
      { item: "Limite e sublimite do Simples", fonte: ls.fonte, vigenteDesde: ls.vigenteDesde },
      { item: "Lucro Presumido", fonte: pr.fonte, vigenteDesde: pr.vigenteDesde },
      { item: "Multas de declarações do Simples", fonte: ms.fonte, vigenteDesde: ms.vigenteDesde },
      { item: "Tabela do IRPF", fonte: ir.fonte, vigenteDesde: ir.vigenteDesde },
      ...(rf ? [{ item: "Reforma Tributária (IBS e CBS)", fonte: rf.fonte, vigenteDesde: rf.vigenteDesde }] : []),
    ],
  };
}
