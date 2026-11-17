import { describe, expect, it } from "vitest";
import { analisarMei, parcelamentoMei } from "@/lib/motor/mei";
import type { EntradaMei } from "@/lib/motor/tipos";

const base: EntradaMei = {
  dataBase: "2026-06-01",
  situacao: "ATIVA",
  faturamento12m: 60000,
  atividade: "servico",
  atividadePermitidaMei: true,
  salarioEmpregado: 0,
  debitos: [],
  proLaboreMensal: 1621,
  honorarios: { meiMensal: 150, meMensal: 450, baixa: 300, abertura: 800 },
};

const cen = (r: ReturnType<typeof analisarMei>, c: string) => r.cenarios.find((x) => x.codigo === c)!;

describe("análise do MEI", () => {
  it("sem débitos e dentro do limite, continuar MEI é o mais barato", () => {
    const r = analisarMei(base);
    expect(r.totalDebitos).toBe(0);
    expect(r.recomendado).toBe("A");
    expect(cen(r, "A").desembolso12m).toBe(2832.6);
  });

  it("acima do limite com tolerância, MEI deixa de ser viável", () => {
    const r = analisarMei({ ...base, faturamento12m: 90000 });
    expect(cen(r, "A").viavel).toBe(false);
    expect(r.recomendado).not.toBe("A");
  });

  it("a dívida total aparece em todos os caminhos e fica fora do custo de 12 meses", () => {
    const r = analisarMei({
      ...base,
      faturamento12m: 120000,
      debitos: [
        { tipo: "DIVIDA_ATIVA", descricao: "", competencia: "2023", valor: 3000, origem: "manual" },
        { tipo: "DASN_OMISSA", descricao: "", competencia: "2024", valor: 0, origem: "manual" },
      ],
    });
    expect(r.totalDebitos).toBe(3050);
    expect(r.cenarios.map((c) => c.codigo)).toEqual(["A", "B", "C"]);
    for (const c of r.cenarios) expect(c.regularizacao).toBe(3050);
    expect(cen(r, "B").custo12m).toBe(300);
    expect(cen(r, "C").desembolso12m).toBe(cen(r, "C").custo12m + 3050);
    expect(r.recomendado).toBe("C");
  });

  it("CNPJ inapto gera alerta de entrega das declarações", () => {
    const r = analisarMei({ ...base, situacao: "INAPTA", debitos: [{ tipo: "DASN_OMISSA", descricao: "", valor: 0, origem: "manual" }] });
    expect(cen(r, "A").alertas.join(" ")).toContain("inapto");
  });

  it("encerrar não entra na recomendação de continuidade", () => {
    const r = analisarMei(base);
    expect(cen(r, "B").continuaOperando).toBe(false);
  });

  it("parcelamento respeita parcela mínima e 60 vezes", () => {
    expect(parcelamentoMei(200)).toEqual({ parcelas: 4, valor: 50 });
    expect(parcelamentoMei(12000)).toEqual({ parcelas: 60, valor: 200 });
    expect(parcelamentoMei(0)).toBeUndefined();
  });
});

describe("fator R", () => {
  it("sugere o pró-labore que leva ao Anexo III", () => {
    const r = analisarMei({ ...base, faturamento12m: 120000 });
    expect(r.cenarios.find((c) => c.codigo === "C")!.alertas.join(" ")).toContain("R$ 2.800/mês");
  });
});
