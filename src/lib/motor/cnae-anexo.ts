import type { Enquadramento } from "./simples";

/**
 * Sugestão de anexo do Simples pelo CNAE principal. É só um ponto de partida:
 * o enquadramento depende da atividade efetivamente exercida (LC 123/2006, art. 18, §§ 4º a 5º-I e 5º-M)
 * e o contador confirma na tela.
 */
export function sugerirEnquadramento(cnae: string): { enquadramento: Enquadramento; motivo: string } {
  const c = cnae.replace(/\D/g, "");
  const div = Number(c.slice(0, 2));
  const classe = c.slice(0, 4);
  if (div >= 45 && div <= 47) return { enquadramento: "I", motivo: "Comércio (Anexo I)" };
  if (div >= 10 && div <= 33) return { enquadramento: "II", motivo: "Indústria (Anexo II)" };
  if (div >= 41 && div <= 43) return { enquadramento: "IV", motivo: "Construção civil (Anexo IV, CPP fora do DAS)" };
  if (classe === "6911") return { enquadramento: "IV", motivo: "Advocacia (Anexo IV)" };
  if (["8011", "8012", "8121", "8122", "8129"].includes(classe)) return { enquadramento: "IV", motivo: "Vigilância ou limpeza (Anexo IV)" };
  if (classe === "6920") return { enquadramento: "III", motivo: "Contabilidade (Anexo III)" };
  if ([62, 63, 70, 71, 72, 73, 75, 86].includes(div) || ["7410", "7490", "8650"].includes(classe)) {
    return { enquadramento: "FATOR_R", motivo: "Serviço sujeito ao fator R (Anexo III ou V)" };
  }
  return { enquadramento: "III", motivo: "Serviço em geral (Anexo III): confirmar" };
}
