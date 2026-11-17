import { ALIQUOTA_INSS_PRO_LABORE, FATOR_R_MINIMO, MEI_REGRAS, parametrosEm, type Parametros } from "./parametros";
import type { Atividade } from "./tipos";

export const arred = (v: number) => Math.round(v * 100) / 100;

/** DAS mensal do MEI conforme a atividade. */
export function dasMei(atividade: Atividade, p: Parametros = parametrosEm()): number {
  const inss = p.salarioMinimo * MEI_REGRAS.aliquotaInss;
  const icms = atividade === "comercio" || atividade === "industria" ? MEI_REGRAS.icmsMensal : 0;
  const iss = atividade === "servico" ? MEI_REGRAS.issMensal : 0;
  return arred(inss + icms + iss);
}

export type Anexo = "I" | "II" | "III" | "V";

/** Alíquota efetiva do Simples: (RBT12 × nominal − dedução) / RBT12. */
export function aliquotaEfetivaSimples(rbt12: number, anexo: Anexo, p: Parametros = parametrosEm()): number {
  const tabela = p.anexosSimples[anexo];
  if (rbt12 <= 0) return tabela[0].aliquota;
  const faixa = tabela.find((f) => rbt12 <= f.ate);
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

export function inssProLabore(proLabore: number, p: Parametros = parametrosEm()): number {
  return arred(Math.min(proLabore, p.tetoInss) * ALIQUOTA_INSS_PRO_LABORE);
}

/** IRRF mensal sobre o pró-labore, com a dedução mais vantajosa e a redução vigente. */
export function irrfProLabore(proLabore: number, p: Parametros = parametrosEm()): number {
  const inss = inssProLabore(proLabore, p);
  const deducao = Math.max(inss, p.irpf.descontoSimplificado);
  const base = Math.max(0, proLabore - deducao);
  const faixa = p.irpf.faixas.find((f) => base <= f.ate)!;
  let imposto = Math.max(0, base * faixa.aliquota - faixa.deducao);
  const r = p.irpf.reducao;
  if (r) {
    if (proLabore <= r.isencaoAte) imposto = Math.max(0, imposto - r.reducaoMaxima);
    else if (proLabore <= r.faixaFinal) imposto = Math.max(0, imposto - Math.max(0, r.constante - r.fator * proLabore));
  }
  return arred(imposto);
}
