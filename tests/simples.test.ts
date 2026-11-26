import { describe, expect, it } from "vitest";
import { parametrosEm } from "@/lib/motor/parametros";
import {
  analisarSimples,
  apurarSimples,
  custoMensalPresumido,
  faixaSimples,
  partilhaEfetiva,
  proLaboreOtimo,
  rbt12Proporcional,
  type EntradaSimples,
} from "@/lib/motor/simples";

const p = parametrosEm("2026-06-01");

function entrada(parcial: Partial<EntradaSimples>): EntradaSimples {
  return {
    dataBase: "2026-06-01",
    situacao: "ATIVA",
    atividades: [],
    folha: { salariosMensais: 0, proLaboreMensal: 0, socios: 1 },
    issMunicipal: 0.05,
    icmsEfetivoNormal: 0.05,
    comprasComCredito: 0.3,
    vendasParaEmpresas: 0.5,
    debitos: [],
    honorarios: { simplesMensal: 0, presumidoMensal: 0, baixa: 800 },
    ...parcial,
  };
}

describe("Simples Nacional: tabelas", () => {
  it("todas as faixas de partilha somam 100%", () => {
    for (const [anexo, faixas] of Object.entries(p.partilhaSimples)) {
      faixas.forEach((f, i) => expect(Object.values(f).reduce((s, v) => s + (v ?? 0), 0), `Anexo ${anexo} faixa ${i + 1}`).toBeCloseTo(1, 6));
    }
  });
  it("calcula a faixa e a alíquota efetiva do Anexo IV", () => {
    const f = faixaSimples(500000, "IV", p);
    expect(f.faixa).toBe(3);
    expect(f.efetiva).toBeCloseTo((500000 * 0.102 - 12420) / 500000, 8);
  });
  it("limita o ISS efetivo a 5% e repassa o excesso aos federais", () => {
    const f = faixaSimples(3000000, "III", p);
    expect(f.efetiva).toBeCloseTo(0.16812, 5);
    const ef = partilhaEfetiva(f.efetiva, p.partilhaSimples.III[f.faixa - 1]);
    expect(ef.ISS).toBeCloseTo(0.05, 8);
    expect(Object.values(ef).reduce((s, v) => s + (v ?? 0), 0)).toBeCloseTo(f.efetiva, 8);
  });
  it("proporcionaliza o RBT12 no início de atividade", () => {
    expect(rbt12Proporcional(60000, 4)).toBe(180000);
    expect(rbt12Proporcional(500000, 12)).toBe(500000);
  });
});

describe("Simples Nacional: apuração", () => {
  it("comércio com ICMS-ST tira metade do ICMS do DAS", () => {
    const sem = apurarSimples(entrada({ rbt12: 300000, atividades: [{ descricao: "Revenda", enquadramento: "I", receitaMensal: 25000 }] }), p);
    expect(sem.dasMensal).toBe(1330);
    const com = apurarSimples(entrada({ rbt12: 300000, atividades: [{ descricao: "Revenda", enquadramento: "I", receitaMensal: 25000, icmsSt: 0.5 }] }), p);
    expect(com.dasMensal).toBeCloseTo(1330 - 1330 * 0.34 * 0.5, 1);
  });
  it("acima do sublimite o ICMS sai do DAS e é pago por fora", () => {
    const ap = apurarSimples(entrada({ rbt12: 4000000, atividades: [{ descricao: "Revenda", enquadramento: "I", receitaMensal: 330000 }] }), p);
    expect(ap.acimaSublimite).toBe(true);
    expect(ap.porTributo.ICMS).toBeUndefined();
    expect(ap.dasMensal).toBeCloseTo(330000 * 0.0955, 0);
    expect(ap.foraDoDas[0].valor).toBe(16500);
  });
  it("fator R abaixo de 28% leva ao Anexo V", () => {
    const e = entrada({ rbt12: 600000, folha: { salariosMensais: 0, proLaboreMensal: 3000, socios: 1 }, atividades: [{ descricao: "Consultoria", enquadramento: "FATOR_R", receitaMensal: 50000 }] });
    const ap = apurarSimples(e, p);
    expect(ap.fatorR).toBeCloseTo(0.06, 4);
    expect(ap.atividades[0].anexo).toBe("V");
    expect(ap.dasMensal).toBe(8925);
  });
  it("sugere o pró-labore que leva ao Anexo III e mede a economia líquida", () => {
    const e = entrada({ rbt12: 600000, folha: { salariosMensais: 0, proLaboreMensal: 3000, socios: 1 }, atividades: [{ descricao: "Consultoria", enquadramento: "FATOR_R", receitaMensal: 50000 }] });
    const s = proLaboreOtimo(e, p);
    expect(s.sugerido).toBe(14000);
    expect(s.aplicavel).toBe(true);
    // DAS cai 3.645,00; INSS sobe 602,31 e IRRF sobe 2.684,88
    expect(s.economiaMensal).toBeCloseTo(357.81, 1);
  });
  it("Anexo IV paga a CPP por fora do DAS", () => {
    const e = entrada({ rbt12: 600000, folha: { salariosMensais: 10000, proLaboreMensal: 2000, socios: 1, incluirProvisoes: false, rat: 0.03 }, atividades: [{ descricao: "Obra", enquadramento: "IV", receitaMensal: 50000 }] });
    const ap = apurarSimples(e, p);
    expect(ap.porTributo.CPP).toBeUndefined();
    expect(ap.foraDoDas.find((l) => l.item.startsWith("CPP"))!.valor).toBe(10000 * 0.23 + 2000 * 0.2);
  });
});

describe("Lucro Presumido e cenários", () => {
  it("calcula o Presumido de serviço", () => {
    const e = entrada({ folha: { salariosMensais: 0, proLaboreMensal: 3000, socios: 1 }, atividades: [{ descricao: "Consultoria", enquadramento: "FATOR_R", receitaMensal: 50000 }] });
    const t = custoMensalPresumido(e, p).tributos;
    expect(t).toMatchObject({ irpj: 2400, adicional: 0, csll: 1440, pis: 325, cofins: 1500, iss: 2500, cpp: 600 });
  });
  it("monta os caminhos, recomenda o mais barato e no caminho de baixa mostra só o honorário", () => {
    const e = entrada({
      rbt12: 600000,
      folha: { salariosMensais: 0, proLaboreMensal: 3000, socios: 1 },
      atividades: [{ descricao: "Consultoria", enquadramento: "FATOR_R", receitaMensal: 50000 }],
      debitos: [
        { tipo: "DAS", descricao: "SIMPLES NAC.", competencia: "01/2025", valor: 1649.37, origem: "upload" },
        { tipo: "PGDAS_OMISSA", descricao: "PGDAS-D", competencia: "02/2025", valor: 0, origem: "integra" },
      ],
    });
    const r = analisarSimples(e);
    expect(r.cenarios.map((c) => c.codigo)).toEqual(["A", "B", "C", "D"]);
    expect(r.totalDebitos).toBe(1699.37);
    expect(r.impeditivos).toBe(1649.37);
    const d = r.cenarios.find((c) => c.codigo === "D")!;
    expect(d.custoUnico).toEqual([{ item: "Honorário de baixa", valor: 800 }]);
    expect(d.custo12m).toBe(800);
    expect(r.recomendado).toBe("B");
    expect(r.cenarios.some((c) => /sem regularizar/i.test(c.titulo))).toBe(false);
  });
  it("projeta IBS e CBS: o Simples puro mantém o DAS e o híbrido aparece a partir de 2027", () => {
    const e = entrada({ rbt12: 600000, folha: { salariosMensais: 0, proLaboreMensal: 20000, socios: 1 }, atividades: [{ descricao: "Consultoria", enquadramento: "FATOR_R", receitaMensal: 50000 }] });
    const r = analisarSimples(e).reforma;
    expect(r[0].ano).toBe(2026);
    expect(r[0].simplesHibrido).toBeUndefined();
    const a27 = r.find((x) => x.ano === 2027)!;
    expect(a27.simplesPuro).toBe(r[0].simplesPuro);
    expect(a27.simplesHibrido).toBeGreaterThan(0);
    expect(a27.creditoCompradorHibrido!).toBeGreaterThan(a27.creditoComprador);
  });
});
