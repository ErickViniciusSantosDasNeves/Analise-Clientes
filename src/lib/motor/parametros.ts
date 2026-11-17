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

export interface TabelaIrpf {
  faixas: { ate: number; aliquota: number; deducao: number }[];
  descontoSimplificado: number;
  /** Redução mensal da Lei 15.270/2025 (ausente antes de 2026). */
  reducao?: { isencaoAte: number; reducaoMaxima: number; faixaFinal: number; constante: number; fator: number };
}

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
  ] as Versao<Record<"I" | "II" | "III" | "V", FaixaSimples[]>>[],

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
  anexosSimples: Record<"I" | "II" | "III" | "V", FaixaSimples[]>;
  irpf: TabelaIrpf;
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
  return {
    data,
    salarioMinimo: sm.valor,
    tetoInss: teto.valor,
    limiteMei: lim.valor,
    anexosSimples: sn.valor,
    irpf: ir.valor,
    fontes: [
      { item: "Salário mínimo", fonte: sm.fonte, vigenteDesde: sm.vigenteDesde },
      { item: "Teto do INSS", fonte: teto.fonte, vigenteDesde: teto.vigenteDesde },
      { item: "Limite do MEI", fonte: lim.fonte, vigenteDesde: lim.vigenteDesde },
      { item: "Tabelas do Simples", fonte: sn.fonte, vigenteDesde: sn.vigenteDesde },
      { item: "Tabela do IRPF", fonte: ir.fonte, vigenteDesde: ir.vigenteDesde },
    ],
  };
}
