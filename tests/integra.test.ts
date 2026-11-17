import { describe, expect, it } from "vitest";
import forge from "node-forge";
import { interpretarCorpo, lerEtag, mapearDividaAtivaPgmei, pfxParaPem } from "@/lib/fontes/integra-contador";
import { mapearBrasilApi } from "@/lib/fontes/brasilapi";

describe("fontes", () => {
  it("mapeia a dívida ativa do PGMEI", () => {
    const d = mapearDividaAtivaPgmei([{ periodoApuracao: "202203", tributo: "INSS", valor: 60.6, enteFederado: "Uniao", situacaoDebito: "ENVIADO A  PFN" }], 2022);
    expect(d).toEqual([
      { tipo: "DIVIDA_ATIVA", orgao: "PGFN", descricao: "DAS MEI INSS em dívida ativa", competencia: "03/2022", valor: 60.6, situacao: "ENVIADO A PFN", origem: "integra" },
    ]);
    const iss = mapearDividaAtivaPgmei([{ periodoApuracao: "202305", tributo: "ISS", valor: 5, enteFederado: "Município" }], 2023);
    expect(iss[0].orgao).toBe("PREFEITURA");
    const icms = mapearDividaAtivaPgmei([{ periodoApuracao: "202305", tributo: "ICMS", valor: 1, enteFederado: "ESTADO" }], 2023);
    expect(icms[0].orgao).toBe("ESTADO");
  });
  it("lê o ETag do SITFIS e o corpo com dados em texto", () => {
    expect(lerEtag('"tempoEspera:4000"', "tempoEspera")).toBe("4000");
    expect(lerEtag('"protocoloRelatorio:abc+/="', "protocoloRelatorio")).toBe("abc+/=");
    expect(lerEtag(undefined, "tempoEspera")).toBeUndefined();
    const c = interpretarCorpo(JSON.stringify({ mensagens: [{ codigo: "X", texto: "ok" }], dados: JSON.stringify([{ pdf: "JVBE" }]) }));
    expect(c.dados).toEqual([{ pdf: "JVBE" }]);
  });
  it("abre certificado A1 (.pfx) com criptografia antiga", () => {
    const chaves = forge.pki.rsa.generateKeyPair(1024);
    const cert = forge.pki.createCertificate();
    cert.publicKey = chaves.publicKey;
    cert.serialNumber = "01";
    cert.validity.notBefore = new Date();
    cert.validity.notAfter = new Date(Date.now() + 86400000);
    cert.setSubject([{ name: "commonName", value: "EMPRESA TESTE:11222333000181" }]);
    cert.setIssuer(cert.subject.attributes);
    cert.sign(chaves.privateKey);
    const p12 = forge.pkcs12.toPkcs12Asn1(chaves.privateKey, [cert], "senha123", { algorithm: "3des" });
    const b64 = forge.util.encode64(forge.asn1.toDer(p12).getBytes());
    const pem = pfxParaPem(b64, "senha123");
    expect(pem.chave).toContain("PRIVATE KEY");
    expect(pem.certificado).toContain("BEGIN CERTIFICATE");
    expect(() => pfxParaPem(b64, "errada")).toThrow();
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

describe("Minha Receita", () => {
  it("usa o mesmo mapeamento da BrasilAPI", async () => {
    const { readFileSync } = await import("node:fs");
    const j = JSON.parse(readFileSync(new URL("./fixtures/minhareceita-mei-inapto.json", import.meta.url), "utf8"));
    const c = mapearBrasilApi(j);
    expect(c).toMatchObject({ situacao: "INAPTA", motivoSituacao: "OMISSAO DE DECLARACOES", optanteMei: true, abertura: "2021-05-24" });
    expect(c.cnaePrincipal.codigo).toBe("3101200");
  });
});
