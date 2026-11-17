import { describe, expect, it } from "vitest";
import { aliquotaEfetivaSimples, anexoSimples, dasMei as dasMeiP, inssProLabore as inssP, irrfProLabore as irrfP } from "@/lib/motor/calculos";
import { parametrosEm } from "@/lib/motor/parametros";

const p26 = parametrosEm("2026-06-01");
const dasMei = (a: Parameters<typeof dasMeiP>[0]) => dasMeiP(a, p26);
const inssProLabore = (v: number) => inssP(v, p26);
const irrfProLabore = (v: number) => irrfP(v, p26);

describe("cálculos", () => {
  it("DAS do MEI por atividade", () => {
    expect(dasMei("servico")).toBe(86.05);
    expect(dasMei("comercio")).toBe(82.05);
  });
  it("alíquota efetiva do Simples", () => {
    expect(aliquotaEfetivaSimples(180000, "III")).toBeCloseTo(0.06);
    expect(aliquotaEfetivaSimples(300000, "III")).toBeCloseTo(0.0808, 4);
    expect(aliquotaEfetivaSimples(100000, "I")).toBeCloseTo(0.04);
  });
  it("fator R escolhe Anexo III ou V", () => {
    expect(anexoSimples("servico", 30000, 100000).anexo).toBe("III");
    expect(anexoSimples("servico", 20000, 100000).anexo).toBe("V");
    expect(anexoSimples("comercio", 0, 100000).anexo).toBe("I");
  });
  it("INSS e IRRF do pró-labore", () => {
    expect(inssProLabore(1621)).toBe(178.31);
    expect(inssProLabore(20000)).toBe(932.31);
    expect(irrfProLabore(1621)).toBe(0);
    expect(irrfProLabore(5000)).toBe(0);
    expect(irrfProLabore(10000)).toBe(1584.88);
  });
});
