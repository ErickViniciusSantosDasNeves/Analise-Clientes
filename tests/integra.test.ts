import { describe, expect, it } from "vitest";
import { mapearDividaAtivaPgmei } from "@/lib/fontes/integra-contador";
import { mapearBrasilApi } from "@/lib/fontes/brasilapi";

describe("fontes", () => {
  it("mapeia lista de dívida ativa com campo de valor", () => {
    const d = mapearDividaAtivaPgmei({ dividas: [{ periodoApuracao: "202303", valorTotal: 120.5 }] }, 2023);
    expect(d).toHaveLength(1);
    expect(d[0]).toMatchObject({ tipo: "DIVIDA_ATIVA", competencia: "202303", valor: 120.5, origem: "integra" });
  });
  it("mapeia o cadastro da BrasilAPI", () => {
    const c = mapearBrasilApi({
      cnpj: "11222333000181",
      razao_social: "FULANO 123",
      descricao_situacao_cadastral: "INAPTA",
      cnae_fiscal: 9602501,
      cnae_fiscal_descricao: "Cabeleireiros",
      cnaes_secundarios: [{ codigo: 0, descricao: "" }],
      opcao_pelo_mei: true,
      qsa: [],
    });
    expect(c.situacao).toBe("INAPTA");
    expect(c.cnaesSecundarios).toHaveLength(0);
    expect(c.optanteMei).toBe(true);
  });
});
