import { ANEXOS_SIMPLES, FATOR_R_MINIMO, INSS_PRO_LABORE, IRPF, MEI, SALARIO_MINIMO } from "./parametros";
import type { Atividade } from "./tipos";

export const arred = (v: number) => Math.round(v * 100) / 100;

/** DAS mensal do MEI conforme a atividade. */
export function dasMei(atividade: Atividade): number {
  const inss = SALARIO_MINIMO * MEI.aliquotaInss;
  const icms = atividade === "comercio" || atividade === "industria" ? MEI.icmsMensal : 0;
  const iss = atividade === "servico" ? MEI.issMensal : 0;
  return arred(inss + icms + iss);
}

export type Anexo = keyof typeof ANEXOS_SIMPLES;

/** Alíquota efetiva do Simples: (RBT12 × nominal − dedução) / RBT12. */
export function aliquotaEfetivaSimples(rbt12: number, anexo: Anexo): number {
  if (rbt12 <= 0) return ANEXOS_SIMPLES[anexo][0].aliquota;
  const faixa = ANEXOS_SIMPLES[anexo].find((f) => rbt12 <= f.ate);
  if (!faixa) throw new Error("Receita acima do limite do Simples Nacional");
  return (rbt12 * faixa.aliquota - faixa.deducao) / rbt12;
}

/** Anexo do Simples. Serviço usa o fator R para escolher entre III e V. */
export function anexoSimples(atividade: Atividade, folha12m: number, rbt12: number): { anexo: Anexo; fatorR?: number } {
  if (atividade === "comercio") return { anexo: "I" };
  if (atividade === "industria") return { anexo: "II" };
  const fatorR = rbt12 > 0 ? folha12m / rbt12 : 0;
  return { anexo: fatorR >= FATOR_R_MINIMO ? "III" : "V", fatorR };
}

export function inssProLabore(proLabore: number): number {
  return arred(Math.min(proLabore, INSS_PRO_LABORE.teto) * INSS_PRO_LABORE.aliquota);
}

/** IRRF mensal sobre o pró-labore, com a dedução mais vantajosa e a redução de 2026. */
export function irrfProLabore(proLabore: number): number {
  const inss = inssProLabore(proLabore);
  const deducao = Math.max(inss, IRPF.descontoSimplificado);
  const base = Math.max(0, proLabore - deducao);
  const faixa = IRPF.faixas.find((f) => base <= f.ate)!;
  let imposto = Math.max(0, base * faixa.aliquota - faixa.deducao);
  const r = IRPF.reducao;
  if (proLabore <= r.isencaoAte) {
    imposto = Math.max(0, imposto - r.reducaoMaxima);
  } else if (proLabore <= r.faixaFinal) {
    imposto = Math.max(0, imposto - Math.max(0, r.constante - r.fator * proLabore));
  }
  return arred(imposto);
}
