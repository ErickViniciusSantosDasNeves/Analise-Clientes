import { HISTORICO, parametrosEm, REFERENCIA_REFORMA, type EtapaReforma } from "./parametros";
import type { CodigoCenario } from "./tipos";

export interface AnoReforma extends EtapaReforma {
  ano: number;
  fonte: string;
}

/** Cronograma ano a ano da transição, a partir das versões com vigência. */
export function cronogramaReforma(deAno = 2026, ateAno = 2033): AnoReforma[] {
  const anos: AnoReforma[] = [];
  for (let ano = deAno; ano <= ateAno; ano++) {
    const p = parametrosEm(`${ano}-06-30`);
    const fonte = p.fontes.find((f) => f.item.startsWith("Reforma"))?.fonte ?? "";
    if (p.reforma) anos.push({ ano, fonte, ...p.reforma });
  }
  return anos;
}

/**
 * Próxima janela para a ME/EPP do Simples escolher recolher IBS e CBS
 * por fora do DAS (Simples "híbrido"): setembro para o 1º semestre do ano
 * seguinte e março para o 2º semestre. Cancelamento até 30 de novembro.
 * Fonte: Receita Federal (Res. CGSN 186, 190 e 191/2026). CONFERIR a cada ano.
 */
export function janelaOpcaoHibrido(dataIso: string): { janela: string; efeitos: string; cancelamento?: string } {
  const [ano, mes] = dataIso.split("-").map(Number);
  if (mes <= 3) return { janela: `março de ${ano}`, efeitos: `julho a dezembro de ${ano}` };
  if (mes <= 9) return { janela: `1 a 30 de setembro de ${ano}`, efeitos: `janeiro a junho de ${ano + 1}` };
  return {
    janela: `março de ${ano + 1}`,
    efeitos: `julho a dezembro de ${ano + 1}`,
    cancelamento: mes <= 11 ? `Quem optou em setembro ainda pode cancelar até 30 de novembro de ${ano}.` : undefined,
  };
}

export interface AnaliseReforma {
  cronograma: AnoReforma[];
  aliquotaPlenaEstimada: number;
  porCaminho: Record<CodigoCenario, string[]>;
}

/** O que muda com IBS e CBS em cada caminho. vendasParaEmpresas em fração (0 a 1). */
export function analisarReforma(dataIso: string, vendasParaEmpresas: number): AnaliseReforma {
  const j = janelaOpcaoHibrido(dataIso);
  const plena = REFERENCIA_REFORMA.cbs + REFERENCIA_REFORMA.ibs;
  const pct = (v: number) => `${(v * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
  const c: string[] = [
    "No Simples \"puro\", a CBS e o IBS entram dentro do DAS no lugar de PIS, Cofins, ICMS e ISS. O valor total do DAS deste cálculo não muda.",
    "Quem compra desta empresa só aproveita como crédito a parcela de CBS e IBS paga dentro do DAS, bem menor que a alíquota cheia.",
    `No Simples "híbrido", a empresa paga CBS e IBS por fora do DAS, pela alíquota cheia (estimada em ${pct(plena)} quando a transição terminar), e desconta os créditos das compras. O cliente comprador passa a ter crédito integral.`,
    `Próxima janela para optar pelo híbrido: ${j.janela}, com efeitos de ${j.efeitos}.${j.cancelamento ? " " + j.cancelamento : ""}`,
  ];
  if (vendasParaEmpresas >= 0.5) {
    c.push(`${pct(vendasParaEmpresas)} das vendas são para empresas: avaliar o Simples híbrido, porque o comprador pode preferir fornecedor que gere crédito integral.`);
  } else {
    c.push(`${pct(vendasParaEmpresas)} das vendas são para empresas: para quem vende a consumidor final, o Simples puro tende a continuar mais simples e barato.`);
  }
  return {
    cronograma: cronogramaReforma(),
    aliquotaPlenaEstimada: plena,
    porCaminho: {
      A: [
        "O MEI continua pagando o DAS em valor fixo. Não existe opção do MEI pelo regime regular de IBS e CBS.",
        "Quem compra do MEI tem crédito limitado ao que está embutido no DAS fixo. Se a maior parte das vendas for para empresas, isso pode pesar na negociação.",
      ],
      B: ["Com a baixa, a Reforma não afeta mais o cliente."],
      C: c,
    },
  };
}

export { HISTORICO };
