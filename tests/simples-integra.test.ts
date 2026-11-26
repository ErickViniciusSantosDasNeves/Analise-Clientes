import { describe, expect, it } from "vitest";
import { anosDefisOmissos, debitosDeOmissoes, mapearDefis, mapearParcelamentos, mapearPgdasd, mesesOmissos, ultimoPeriodoVencido } from "@/lib/fontes/simples-integra";

describe("obrigações do Simples (Integra Contador)", () => {
  it("lê as declarações do PGDAS-D por período", () => {
    const dados = {
      anoCalendario: 2025,
      periodos: [
        {
          periodoApuracao: 202501,
          operacoes: [
            { tipoOperacao: "Declaração Original", indiceDeclaracao: { numeroDeclaracao: "1", dataHoraTransmissao: 20250215103000, malha: null } },
            { tipoOperacao: "Geração de DAS", indiceDas: { numeroDas: "9", dataHoraEmissaoDas: 20250215103100, dasPago: false } },
          ],
        },
        { periodoApuracao: 202502, operacoes: [{ tipoOperacao: "Declaração Retificadora", indiceDeclaracao: { numeroDeclaracao: "2", dataHoraTransmissao: 20250318090000 } }] },
      ],
    };
    const p = mapearPgdasd(dados);
    expect(p).toEqual([
      { periodo: "202501", declaracoes: 1, retificada: false, ultimaTransmissao: "15/02/2025 10:30", malha: undefined, dasGerado: true, dasPago: false },
      { periodo: "202502", declaracoes: 1, retificada: true, ultimaTransmissao: "18/03/2025 09:00", malha: undefined, dasGerado: false, dasPago: undefined },
    ]);
  });
  it("aponta os meses sem PGDAS-D já vencidos", () => {
    expect(ultimoPeriodoVencido("2026-11-26")).toBe("202610");
    expect(ultimoPeriodoVencido("2026-11-10")).toBe("202609");
    expect(ultimoPeriodoVencido("2026-01-05")).toBe("202511");
    expect(mesesOmissos(["202607", "202609"], "202607", "2026-11-26")).toEqual(["202608", "202610"]);
  });
  it("aponta as DEFIS em atraso", () => {
    expect(anosDefisOmissos([2023], 2022, "2026-11-26")).toEqual([2022, 2024, 2025]);
    expect(anosDefisOmissos([2023], 2022, "2026-02-01")).toEqual([2022, 2024]);
    expect(mapearDefis([{ ano: 2023 }, { anoCalendario: 2024 }])).toEqual([2023, 2024]);
  });
  it("lê os parcelamentos e transforma omissões em débitos com a multa mínima", () => {
    expect(mapearParcelamentos({ parcelamentos: [{ numero: 1, dataDoPedido: 20240110, situacao: "Em parcelamento" }] }, "PARCSN")).toEqual([
      { numero: "1", modalidade: "PARCSN", pedido: "10/01/2024", situacao: "Em parcelamento" },
    ]);
    const d = debitosDeOmissoes({ pgdasOmissos: ["202608"], defisOmissas: [2025] }, "2026-11-26");
    expect(d.map((x) => [x.tipo, x.competencia])).toEqual([["PGDAS_OMISSA", "08/2026"], ["DEFIS_OMISSA", "2025"]]);
  });
});
