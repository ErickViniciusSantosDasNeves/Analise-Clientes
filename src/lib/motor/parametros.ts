/**
 * Parâmetros legais usados nos cálculos. Ficam todos aqui para o escritório
 * revisar e atualizar sem mexer na lógica. Valores marcados com "CONFERIR"
 * devem ser validados pelo contador antes do uso com cliente.
 */

export const ANO_BASE = 2026;

/** Salário mínimo nacional (CONFERIR o decreto do ano). */
export const SALARIO_MINIMO = 1621.0;

export const MEI = {
  /** Limite anual de receita bruta do MEI. Aumento em discussão para 2027. */
  limiteAnual: 81000,
  /** Até 20% acima do limite: desenquadra a partir de janeiro do ano seguinte. */
  toleranciaExcesso: 0.2,
  /** INSS do MEI: 5% do salário mínimo. */
  aliquotaInss: 0.05,
  icmsMensal: 1.0,
  issMensal: 5.0,
  /** Multa mínima por DASN-SIMEI entregue em atraso (estimativa por declaração). */
  multaMinimaDasn: 50.0,
  /** CPP patronal sobre o salário do empregado do MEI. */
  cppEmpregado: 0.03,
  /** PARCMEI: número máximo de parcelas e parcela mínima. */
  parcelamentoMaxParcelas: 60,
  parcelamentoParcelaMinima: 50.0,
};

export const FGTS = 0.08;

/** Fator R mínimo para serviços do Anexo V serem tributados pelo Anexo III. */
export const FATOR_R_MINIMO = 0.28;

export interface FaixaSimples {
  ate: number;
  aliquota: number;
  deducao: number;
}

/** Tabelas do Simples Nacional (LC 123/2006, redação da LC 155/2016). */
export const ANEXOS_SIMPLES: Record<"I" | "II" | "III" | "V", FaixaSimples[]> = {
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
};

/** INSS do contribuinte individual sobre o pró-labore. */
export const INSS_PRO_LABORE = {
  aliquota: 0.11,
  /** Teto do salário de contribuição (CONFERIR portaria do ano). */
  teto: 8475.55,
};

/** IRPF mensal (CONFERIR). Tabela progressiva vigente desde maio/2025. */
export const IRPF = {
  faixas: [
    { ate: 2428.8, aliquota: 0, deducao: 0 },
    { ate: 2826.65, aliquota: 0.075, deducao: 182.16 },
    { ate: 3751.05, aliquota: 0.15, deducao: 394.16 },
    { ate: 4664.68, aliquota: 0.225, deducao: 675.49 },
    { ate: Infinity, aliquota: 0.275, deducao: 908.73 },
  ],
  descontoSimplificado: 607.2,
  /** Redução da Lei 15.270/2025, a partir de 2026 (CONFERIR). */
  reducao: {
    isencaoAte: 5000,
    reducaoMaxima: 312.89,
    faixaFinal: 7350,
    constante: 978.62,
    fator: 0.133145,
  },
};
