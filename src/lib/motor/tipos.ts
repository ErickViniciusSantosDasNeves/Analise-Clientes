export type Atividade = "comercio" | "industria" | "servico";

export type TipoDebito =
  | "DAS" // DAS do MEI em aberto, ainda na Receita
  | "DIVIDA_ATIVA" // já inscrito em dívida ativa (PGFN)
  | "DASN_OMISSA" // declaração anual não entregue
  | "PARCELAMENTO" // saldo de parcelamento ativo
  | "OUTRO";

export interface Debito {
  tipo: TipoDebito;
  descricao: string;
  /** Ex.: "2024-03" ou "2023" */
  competencia?: string;
  /** Valor atualizado (principal + multa + juros), como vem do relatório. */
  valor: number;
  origem: "integra" | "upload" | "manual";
}

export type SituacaoCadastral = "ATIVA" | "INAPTA" | "SUSPENSA" | "BAIXADA" | "NULA" | "DESCONHECIDA";

export interface EntradaMei {
  situacao: SituacaoCadastral;
  /** Receita bruta esperada nos próximos 12 meses. */
  faturamento12m: number;
  atividade: Atividade;
  /** As atividades exercidas estão na lista permitida ao MEI? */
  atividadePermitidaMei: boolean;
  /** Salário mensal do empregado (0 se não tem). */
  salarioEmpregado: number;
  debitos: Debito[];
  /** Pró-labore mensal pretendido no cenário de ME. */
  proLaboreMensal: number;
  honorarios: {
    meiMensal: number;
    meMensal: number;
    baixa: number;
    abertura: number;
  };
}

export type CodigoCenario = "A" | "B" | "C" | "D";

export interface LinhaCusto {
  item: string;
  valor: number;
}

export interface Cenario {
  codigo: CodigoCenario;
  titulo: string;
  viavel: boolean;
  /** Cenário em que o cliente continua trabalhando com CNPJ. */
  continuaOperando: boolean;
  /** Total para regularizar as pendências (à vista). */
  regularizacao: number;
  /** Parcela estimada se parcelar a regularização. */
  parcelaRegularizacao?: { parcelas: number; valor: number };
  /** Custo mensal recorrente depois de resolvido. */
  custoMensal: LinhaCusto[];
  /** Custos que acontecem uma vez (abertura, baixa). */
  custoUnico: LinhaCusto[];
  /** Quanto sai do bolso do cliente em 12 meses, incluindo a regularização quando ela é exigida. */
  desembolso12m: number;
  /** Débito que continua existindo (no CPF) e não entra no desembolso. */
  debitoRemanescente: number;
  regime?: string;
  alertas: string[];
}

export interface ResultadoAnalise {
  totalDebitos: number;
  cenarios: Cenario[];
  recomendado?: CodigoCenario;
  justificativa: string;
}
