import { describe, expect, it } from "vitest";
import { agruparPorOrgao } from "@/lib/motor/debitos";
import type { Debito } from "@/lib/motor/tipos";

describe("débitos por órgão", () => {
  it("separa Receita, PGFN e Prefeitura com subtotais de original, multa e juros", () => {
    const d: Debito[] = [
      { tipo: "DAS", descricao: "DAS", valor: 120, valorOriginal: 100, multa: 15, juros: 5, origem: "integra" },
      { tipo: "DIVIDA_ATIVA", descricao: "Inscrição", valor: 500, origem: "integra" },
      { tipo: "OUTRO", orgao: "PREFEITURA", descricao: "ISS 2024", valor: 230, valorOriginal: 200, multa: 20, juros: 10, origem: "manual" },
      { tipo: "DAS", descricao: "DAS 2", valor: 60, valorOriginal: 50, multa: 5, juros: 5, origem: "integra" },
    ];
    const g = agruparPorOrgao(d);
    expect(g.map((x) => x.orgao)).toEqual(["RECEITA", "PGFN", "PREFEITURA"]);
    expect(g[0]).toMatchObject({ total: 180, valorOriginal: 150, multa: 20, juros: 10, semDetalhe: 0 });
    expect(g[0].itens.map((i) => i.indice)).toEqual([0, 3]);
    expect(g[1]).toMatchObject({ total: 500, semDetalhe: 1 });
    expect(g[2].total).toBe(230);
  });
});
