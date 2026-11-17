import { describe, expect, it } from "vitest";
import { cnpjValido, formatarCnpj, limparCnpj } from "@/lib/cnpj";

describe("CNPJ", () => {
  it("valida CNPJ numérico", () => {
    expect(cnpjValido("11.222.333/0001-81")).toBe(true);
    expect(cnpjValido("11.222.333/0001-82")).toBe(false);
    expect(cnpjValido("00.000.000/0000-00")).toBe(false);
  });
  it("valida CNPJ alfanumérico (exemplo da Receita)", () => {
    expect(cnpjValido("12.ABC.345/01DE-35")).toBe(true);
    expect(cnpjValido("12.ABC.345/01DE-36")).toBe(false);
  });
  it("limpa e formata", () => {
    expect(limparCnpj("12.abc.345/01de-35")).toBe("12ABC34501DE35");
    expect(formatarCnpj("11222333000181")).toBe("11.222.333/0001-81");
  });
});
