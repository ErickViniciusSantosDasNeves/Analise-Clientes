import { describe, expect, it } from "vitest";
import { parametrosEm } from "@/lib/motor/parametros";
import { dasMei, irrfProLabore } from "@/lib/motor/calculos";

describe("parâmetros por vigência", () => {
  it("usa o salário mínimo do ano da análise", () => {
    expect(parametrosEm("2025-06-30").salarioMinimo).toBe(1518);
    expect(parametrosEm("2026-01-01").salarioMinimo).toBe(1621);
    expect(dasMei("servico", parametrosEm("2025-06-30"))).toBe(80.9);
  });
  it("aplica a redução do IR só a partir de 2026", () => {
    expect(irrfProLabore(5000, parametrosEm("2025-12-31"))).toBeGreaterThan(0);
    expect(irrfProLabore(5000, parametrosEm("2026-01-01"))).toBe(0);
  });
  it("informa a norma usada", () => {
    expect(parametrosEm("2026-03-01").fontes.find((f) => f.item === "Tabela do IRPF")!.fonte).toContain("15.270");
  });
});
