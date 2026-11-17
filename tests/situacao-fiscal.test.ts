import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { debitosDoRelatorio, lerSituacaoFiscal } from "@/lib/relatorio/situacao-fiscal";

// Relatório fictício com o mesmo layout do e-CAC (sem dados de clientes reais).
const linhas = readFileSync(path.join(__dirname, "fixtures/situacao-fiscal-ficticia.txt"), "utf8").split("\n");

describe("relatório de situação fiscal", () => {
  const r = lerSituacaoFiscal(linhas);

  it("lê os dados cadastrais e ignora o cabeçalho das páginas", () => {
    expect(r.cnpj).toBe("11222333000181");
    expect(r.razaoSocial).toBe("EMPRESA FICTICIA DE TESTE LTDA");
    expect(r.emitidoEm).toBe("01/10/2026 10:00:00");
    expect(r.situacao).toBe("INAPTA");
    expect(r.abertura).toBe("10/03/2020");
    expect(r.periodosSimples).toEqual([{ inclusao: "10/03/2020", exclusao: undefined }]);
    expect(r.avisos).toEqual([]);
  });

  it("lê débitos do SIEF e do Simples com situação", () => {
    const sief = r.pendencias.find((p) => p.secao === "SIEF")!;
    expect(sief).toMatchObject({ receita: "5440-01 - MAED - DCTFWEB", periodo: "03/02/2025", consolidado: 303.87, situacao: "EM NEGOCIACAO DE PARCELAMENTO" });
    expect(sief.detalhe).toContain("50000000000001");
    const sn = r.pendencias.find((p) => p.secao === "SIMPLES")!;
    expect(sn).toMatchObject({ periodo: "01/2025", consolidado: 1649.37, situacao: "DEVEDOR" });
  });

  it("lê inscrições e parcelamentos da PGFN", () => {
    const sida = r.pendencias.find((p) => p.secao === "SIDA")!;
    expect(sida).toMatchObject({ identificador: "80.4.26.000001-00", receita: "1507-SIMPLES NACIONAL", exigibilidadeSuspensa: true });
    const sispar = r.pendencias.find((p) => p.secao === "SISPAR")!;
    expect(sispar.identificador).toBe("000000001");
    expect(sispar.detalhe).toContain("60 PRESTACOES");
  });

  it("converte em débitos do mapa de pendências", () => {
    const d = debitosDoRelatorio(r);
    expect(d.map((x) => x.tipo)).toEqual(["OUTRO", "DAS", "DIVIDA_ATIVA", "PARCELAMENTO"]);
    expect(d.reduce((s, x) => s + x.valor, 0)).toBeCloseTo(1953.24);
    expect(d.every((x) => x.origem === "upload")).toBe(true);
    expect(d.map((x) => x.orgao)).toEqual(["RECEITA", "RECEITA", "PGFN", "RECEITA"]);
    const das = d[1];
    expect(das.valorOriginal! + das.multa! + das.juros!).toBeCloseTo(das.valor);
  });

  it("avisa quando o consolidado não fecha", () => {
    const ruim = lerSituacaoFiscal([
      "Pendência - Débito (SIEF) ______________",
      "1099-01 - CP-SEGUR.  01/2024  20/02/2024  155,32  155,32  31,06  51,44  999,99",
    ]);
    expect(ruim.avisos.some((a) => a.includes("difere do consolidado"))).toBe(true);
  });
});
