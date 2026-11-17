import { describe, expect, it } from "vitest";
import { analisarReforma, cronogramaReforma, janelaOpcaoHibrido } from "@/lib/motor/reforma";
import { parametrosEm } from "@/lib/motor/parametros";

describe("Reforma Tributária", () => {
  it("cronograma de 2026 a 2033", () => {
    const c = cronogramaReforma();
    expect(c.map((a) => a.ano)).toEqual([2026, 2027, 2028, 2029, 2030, 2031, 2032, 2033]);
    expect(c[0]).toMatchObject({ cbs: 0.009, ibs: 0.001, apenasTeste: true, pisCofinsExiste: true });
    expect(c[1].pisCofinsExiste).toBe(false);
    expect(c.find((a) => a.ano === 2029)!.icmsIssRestante).toBe(0.9);
    expect(c.find((a) => a.ano === 2032)!.icmsIssRestante).toBe(0.6);
    expect(c.at(-1)!.icmsIssRestante).toBe(0);
  });
  it("sem IBS/CBS antes de 2026", () => {
    expect(parametrosEm("2025-12-31").reforma).toBeUndefined();
  });
  it("janela de opção pelo Simples híbrido", () => {
    expect(janelaOpcaoHibrido("2026-11-17")).toMatchObject({ janela: "março de 2027", efeitos: "julho a dezembro de 2027" });
    expect(janelaOpcaoHibrido("2026-11-17").cancelamento).toContain("30 de novembro de 2026");
    expect(janelaOpcaoHibrido("2027-05-10").janela).toBe("1 a 30 de setembro de 2027");
    expect(janelaOpcaoHibrido("2027-02-01").janela).toBe("março de 2027");
  });
  it("MEI não tem opção e vendas a empresas pedem avaliar o híbrido", () => {
    const r = analisarReforma("2026-11-17", 0.8);
    expect(r.porCaminho.A.join(" ")).toContain("Não existe opção do MEI");
    expect(r.porCaminho.C.join(" ")).toContain("avaliar o Simples híbrido");
  });
});
