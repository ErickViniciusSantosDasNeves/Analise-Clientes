import { arred, aliquotaEfetivaSimples, anexoSimples, dasMei, inssProLabore, irrfProLabore } from "./calculos";
import { FATOR_R_MINIMO, FGTS, MEI_REGRAS as MEI, parametrosEm, type Parametros } from "./parametros";
import type { Cenario, CodigoCenario, EntradaMei, LinhaCusto, ResultadoAnalise } from "./tipos";

const soma = (linhas: LinhaCusto[]) => arred(linhas.reduce((s, l) => s + l.valor, 0));

/** Valor de cada débito; declaração omissa sem valor informado conta a multa mínima. */
export function valorDebito(d: EntradaMei["debitos"][number]): number {
  if (d.tipo === "DASN_OMISSA" && d.valor <= 0) return MEI.multaMinimaDasn;
  return d.valor;
}

export function totalDebitos(e: EntradaMei): number {
  return arred(e.debitos.reduce((s, d) => s + valorDebito(d), 0));
}

export function parcelamentoMei(total: number) {
  if (total <= 0) return undefined;
  const parcelas = Math.max(1, Math.min(MEI.parcelamentoMaxParcelas, Math.floor(total / MEI.parcelamentoParcelaMinima)));
  return { parcelas, valor: arred(total / parcelas) };
}

function custoMensalMe(e: EntradaMei, p: Parametros): { linhas: LinhaCusto[]; regime: string; alertas: string[] } {
  const alertas: string[] = [];
  const rbt12 = e.faturamento12m;
  const folha12m = (e.proLaboreMensal + e.salarioEmpregado) * 12;
  const { anexo, fatorR } = anexoSimples(e.atividade, folha12m, rbt12);
  const aliquota = aliquotaEfetivaSimples(rbt12, anexo, p);
  const linhas: LinhaCusto[] = [
    { item: `DAS Simples Nacional (Anexo ${anexo}, ${(aliquota * 100).toFixed(2)}%)`, valor: arred((rbt12 / 12) * aliquota) },
  ];
  if (e.proLaboreMensal > 0) {
    linhas.push({ item: "INSS do sócio sobre o pró-labore (11%)", valor: inssProLabore(e.proLaboreMensal, p) });
    const ir = irrfProLabore(e.proLaboreMensal, p);
    if (ir > 0) linhas.push({ item: "IRRF sobre o pró-labore", valor: ir });
  }
  if (e.salarioEmpregado > 0) linhas.push({ item: "FGTS do empregado (8%)", valor: arred(e.salarioEmpregado * FGTS) });
  linhas.push({ item: "Honorários contábeis (ME)", valor: e.honorarios.meMensal });
  if (fatorR !== undefined) {
    const pct = (fatorR * 100).toFixed(1);
    alertas.push(
      anexo === "III"
        ? `Fator R de ${pct}%: serviço tributado no Anexo III.`
        : `Fator R de ${pct}%, abaixo de 28%: serviço cai no Anexo V. Com pró-labore de R$ ${Math.ceil((FATOR_R_MINIMO * rbt12) / 12 - e.salarioEmpregado).toLocaleString("pt-BR")}/mês vai para o Anexo III.`,
    );
  }
  return { linhas, regime: `Simples Nacional, Anexo ${anexo}`, alertas };
}

export function analisarMei(e: EntradaMei): ResultadoAnalise {
  const p = parametrosEm(e.dataBase);
  const debitos = totalDebitos(e);
  const parcelamento = parcelamentoMei(debitos);
  const limiteComTolerancia = p.limiteMei * (1 + MEI.toleranciaExcesso);
  const inapta = e.situacao === "INAPTA";
  const omissas = e.debitos.filter((d) => d.tipo === "DASN_OMISSA").length;

  // A. Regularizar e continuar MEI
  const alertasA: string[] = [];
  let viavelA = true;
  if (!e.atividadePermitidaMei) {
    viavelA = false;
    alertasA.push("Atividade não permitida ao MEI.");
  }
  if (e.faturamento12m > limiteComTolerancia) {
    viavelA = false;
    alertasA.push(`Faturamento acima de R$ ${limiteComTolerancia.toLocaleString("pt-BR")}: desenquadramento retroativo ao início do ano.`);
  } else if (e.faturamento12m > p.limiteMei) {
    viavelA = false;
    alertasA.push("Faturamento acima do limite do MEI, dentro dos 20% de tolerância: desenquadra em janeiro e paga DAS complementar sobre o excesso.");
  }
  if (inapta) alertasA.push(`CNPJ inapto: entregar ${omissas || "as"} DASN-SIMEI em atraso para reativar.`);
  const mensalA: LinhaCusto[] = [
    { item: "DAS MEI", valor: dasMei(e.atividade, p) },
    { item: "Honorários contábeis (MEI)", valor: e.honorarios.meiMensal },
  ];
  if (e.salarioEmpregado > 0) {
    mensalA.push({ item: "CPP (3%) e FGTS (8%) do empregado", valor: arred(e.salarioEmpregado * (MEI.cppEmpregado + FGTS)) });
  }
  const a: Cenario = {
    codigo: "A",
    titulo: "Regularizar e continuar MEI",
    viavel: viavelA,
    continuaOperando: true,
    regularizacao: debitos,
    parcelaRegularizacao: parcelamento,
    custoMensal: mensalA,
    custoUnico: [],
    custo12m: arred(soma(mensalA) * 12),
    desembolso12m: arred(debitos + soma(mensalA) * 12),
    regime: "MEI",
    alertas: alertasA,
  };

  // B. Regularizar e encerrar
  const unicoB: LinhaCusto[] = [{ item: "Honorário de baixa", valor: e.honorarios.baixa }];
  const b: Cenario = {
    codigo: "B",
    titulo: "Regularizar e dar baixa no MEI",
    viavel: true,
    continuaOperando: false,
    regularizacao: debitos,
    parcelaRegularizacao: parcelamento,
    custoMensal: [],
    custoUnico: unicoB,
    custo12m: soma(unicoB),
    desembolso12m: arred(debitos + soma(unicoB)),
    alertas: ["Indicado quando o cliente vai parar a atividade. Depois da baixa não há custo mensal."],
  };

  const me = custoMensalMe(e, p);

  // C. Transformar o MEI em ME no mesmo CNPJ (desenquadramento)
  const alertasC = [...me.alertas];
  if (debitos > 0) alertasC.push("Para ficar no Simples, os débitos precisam estar pagos ou parcelados.");
  if (inapta) alertasC.push("CNPJ inapto: regularizar as declarações antes de pedir o desenquadramento.");
  const c: Cenario = {
    codigo: "C",
    titulo: "Transformar o MEI em ME no mesmo CNPJ",
    viavel: true,
    continuaOperando: true,
    regularizacao: debitos,
    parcelaRegularizacao: parcelamento,
    custoMensal: me.linhas,
    custoUnico: [],
    custo12m: arred(soma(me.linhas) * 12),
    desembolso12m: arred(debitos + soma(me.linhas) * 12),
    regime: me.regime,
    alertas: alertasC,
  };

  const cenarios = [a, b, c];
  const candidatos = cenarios.filter((x) => x.viavel && x.continuaOperando);
  const melhor = candidatos.sort((x, y) => x.custo12m - y.custo12m)[0];
  const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  let justificativa = "Nenhum caminho de continuidade é viável com os dados informados.";
  if (melhor) {
    justificativa = `Para continuar trabalhando, o caminho ${melhor.codigo} tem o menor custo de impostos e honorários em 12 meses: ${fmt(melhor.custo12m)}.`;
    if (debitos > 0) justificativa += ` A dívida de ${fmt(debitos)} precisa ser regularizada em qualquer caminho.`;
  }
  return { parametros: p, totalDebitos: debitos, cenarios, recomendado: melhor?.codigo as CodigoCenario | undefined, justificativa };
}
