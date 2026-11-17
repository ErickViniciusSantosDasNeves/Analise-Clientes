import https from "node:https";
import forge from "node-forge";
import type { Debito } from "../motor/tipos";

/**
 * Cliente do Integra Contador (Serpro).
 *
 * Autenticação: OAuth2 client_credentials com o certificado e-CNPJ A1 do escritório (mTLS).
 * O escritório é contratante e autor do pedido; cada cliente consultado precisa ter dado
 * procuração eletrônica ao escritório no e-CAC.
 *
 * Credenciais só em variáveis de ambiente do servidor (ver .env.example). Nunca no navegador.
 */

const URL_AUTH = "https://autenticacao.sapi.serpro.gov.br/authenticate";
const URL_BASE = "https://gateway.apiserpro.serpro.gov.br/integra-contador/v1";

type Endpoint = "Consultar" | "Emitir" | "Apoiar";
interface Servico {
  idSistema: string;
  idServico: string;
  versaoSistema: string;
  endpoint: Endpoint;
}

export const SERVICOS = {
  pgmeiDividaAtiva: { idSistema: "PGMEI", idServico: "DIVIDAATIVA24", versaoSistema: "1.0", endpoint: "Consultar" },
  sitfisSolicitarProtocolo: { idSistema: "SITFIS", idServico: "SOLICITARPROTOCOLO91", versaoSistema: "2.0", endpoint: "Apoiar" },
  sitfisEmitirRelatorio: { idSistema: "SITFIS", idServico: "RELATORIOSITFIS92", versaoSistema: "2.0", endpoint: "Emitir" },
} satisfies Record<string, Servico>;

interface Config {
  consumerKey: string;
  consumerSecret: string;
  chave: string;
  certificado: string;
  cnpjContratante: string;
}

export function integraConfigurado(): boolean {
  const e = process.env;
  return Boolean(e.INTEGRA_CONSUMER_KEY && e.INTEGRA_CONSUMER_SECRET && e.INTEGRA_CERT_PFX_BASE64 && e.INTEGRA_CNPJ_CONTRATANTE);
}

/**
 * Converte o .pfx em chave e certificado PEM. Feito com node-forge porque muitos
 * certificados A1 usam criptografia antiga que o OpenSSL 3 do Node recusa.
 */
export function pfxParaPem(pfxBase64: string, senha: string): { chave: string; certificado: string } {
  const asn1 = forge.asn1.fromDer(forge.util.decode64(pfxBase64.replace(/\s/g, "")));
  const p12 = forge.pkcs12.pkcs12FromAsn1(asn1, false, senha);
  const chaves = [
    ...(p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag] ?? []),
    ...(p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag] ?? []),
  ];
  const certs = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] ?? [];
  const chave = chaves.find((b) => b.key)?.key;
  if (!chave || certs.length === 0) throw new Error("Certificado A1 sem chave privada ou sem certificado.");
  // Certificado do titular primeiro, depois a cadeia.
  const pems = certs.filter((b) => b.cert).map((b) => forge.pki.certificateToPem(b.cert!));
  return { chave: forge.pki.privateKeyToPem(chave), certificado: pems.join("\n") };
}

let configCache: Config | undefined;
function lerConfig(): Config {
  if (configCache) return configCache;
  if (!integraConfigurado()) throw new Error("Integra Contador não configurado no servidor.");
  const e = process.env;
  let pem: { chave: string; certificado: string };
  try {
    pem = pfxParaPem(e.INTEGRA_CERT_PFX_BASE64!, e.INTEGRA_CERT_SENHA ?? "");
  } catch {
    throw new Error("Não foi possível abrir o certificado A1. Confira o arquivo em base64 e a senha cadastrados no servidor.");
  }
  configCache = {
    consumerKey: e.INTEGRA_CONSUMER_KEY!,
    consumerSecret: e.INTEGRA_CONSUMER_SECRET!,
    ...pem,
    cnpjContratante: e.INTEGRA_CNPJ_CONTRATANTE!.replace(/\D/g, ""),
  };
  return configCache;
}

interface RespostaHttp {
  status: number;
  corpo: string;
  etag?: string;
}

function postar(url: string, headers: Record<string, string>, corpo: string, cfg: Config): Promise<RespostaHttp> {
  return new Promise((resolve, reject) => {
    const req = https.request(
      url,
      { method: "POST", headers: { ...headers, "Content-Length": Buffer.byteLength(corpo).toString() }, key: cfg.chave, cert: cfg.certificado, timeout: 30000 },
      (res) => {
        let dados = "";
        res.setEncoding("utf8");
        res.on("data", (c) => (dados += c));
        res.on("end", () => resolve({ status: res.statusCode ?? 0, corpo: dados, etag: res.headers.etag }));
      },
    );
    req.on("timeout", () => req.destroy(new Error("Tempo esgotado no Integra Contador")));
    req.on("error", reject);
    req.end(corpo);
  });
}

let tokenCache: { access: string; jwt: string; expira: number } | undefined;

async function autenticar(cfg: Config, renovar = false) {
  if (!renovar && tokenCache && tokenCache.expira > Date.now() + 60_000) return tokenCache;
  const basic = Buffer.from(`${cfg.consumerKey}:${cfg.consumerSecret}`).toString("base64");
  const r = await postar(
    URL_AUTH,
    { Authorization: `Basic ${basic}`, "Role-Type": "TERCEIROS", "Content-Type": "application/x-www-form-urlencoded" },
    "grant_type=client_credentials",
    cfg,
  );
  if (r.status !== 200) throw new Error(`Falha na autenticação do Integra Contador (HTTP ${r.status}). Confira Consumer Key, Secret e certificado.`);
  const j = JSON.parse(r.corpo);
  tokenCache = { access: j.access_token, jwt: j.jwt_token, expira: Date.now() + Number(j.expires_in ?? 3600) * 1000 };
  return tokenCache;
}

export interface RespostaIntegra {
  status: number;
  mensagens: { codigo: string; texto: string }[];
  dados: unknown;
  etag?: string;
}

/** Lê "chave:valor" do cabeçalho ETag (ex.: "tempoEspera:4000"). */
export function lerEtag(etag: string | undefined, chave: string): string | undefined {
  if (!etag) return undefined;
  const limpo = etag.replace(/^W\//, "").replace(/^"|"$/g, "");
  return limpo.startsWith(`${chave}:`) ? limpo.slice(chave.length + 1) : undefined;
}

export function interpretarCorpo(corpo: string): { mensagens: RespostaIntegra["mensagens"]; dados: unknown } {
  let j: { mensagens?: RespostaIntegra["mensagens"]; dados?: unknown } = {};
  try {
    j = corpo ? JSON.parse(corpo) : {};
  } catch {
    /* corpo não JSON */
  }
  let dados: unknown = j.dados;
  if (typeof dados === "string" && dados) {
    try {
      dados = JSON.parse(dados);
    } catch {
      /* mantém texto */
    }
  }
  return { mensagens: j.mensagens ?? [], dados };
}

export async function chamar(cnpjCliente: string, servico: Servico, dados: Record<string, unknown> | ""): Promise<RespostaIntegra> {
  const cfg = lerConfig();
  const pedido = {
    contratante: { numero: cfg.cnpjContratante, tipo: 2 },
    autorPedidoDados: { numero: cfg.cnpjContratante, tipo: 2 },
    contribuinte: { numero: cnpjCliente, tipo: 2 },
    pedidoDados: {
      idSistema: servico.idSistema,
      idServico: servico.idServico,
      versaoSistema: servico.versaoSistema,
      dados: dados === "" ? "" : JSON.stringify(dados),
    },
  };
  for (let tentativa = 0; tentativa < 2; tentativa++) {
    const tk = await autenticar(cfg, tentativa > 0);
    const r = await postar(
      `${URL_BASE}/${servico.endpoint}`,
      { Authorization: `Bearer ${tk.access}`, jwt_token: tk.jwt, "Content-Type": "application/json", Accept: "application/json" },
      JSON.stringify(pedido),
      cfg,
    );
    if (r.status === 401 && tentativa === 0) continue;
    return { status: r.status, etag: r.etag, ...interpretarCorpo(r.corpo) };
  }
  throw new Error("Integra Contador recusou a autenticação.");
}

// ---------- SITFIS: Relatório de Situação Fiscal ----------

const primeiro = (d: unknown) => (Array.isArray(d) ? d[0] : d) as Record<string, unknown> | undefined;
const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Solicita o protocolo e emite o Relatório de Situação Fiscal em PDF.
 * A emissão é assíncrona: enquanto a API responde 202/204, espera o tempo indicado e tenta de novo.
 */
export async function emitirSituacaoFiscal(cnpjCliente: string, limiteMs = 50_000): Promise<{ pdf: Uint8Array; mensagens: string[] }> {
  const inicio = Date.now();
  const p = await chamar(cnpjCliente, SERVICOS.sitfisSolicitarProtocolo, "");
  const protocolo = (primeiro(p.dados)?.protocoloRelatorio as string | undefined) ?? lerEtag(p.etag, "protocoloRelatorio");
  if (!protocolo) throw new Error(erroIntegra("Não foi possível solicitar o relatório", p));
  let aguardar = Number(primeiro(p.dados)?.tempoEspera ?? 0);

  while (Date.now() - inicio + aguardar < limiteMs) {
    if (aguardar > 0) await espera(aguardar);
    const r = await chamar(cnpjCliente, SERVICOS.sitfisEmitirRelatorio, { protocoloRelatorio: protocolo });
    const d = primeiro(r.dados);
    if (r.status === 200 && typeof d?.pdf === "string") {
      return { pdf: new Uint8Array(Buffer.from(d.pdf, "base64")), mensagens: r.mensagens.map((m) => m.texto) };
    }
    if (r.status !== 202 && r.status !== 204) throw new Error(erroIntegra("Não foi possível emitir o relatório", r));
    aguardar = Number(d?.tempoEspera ?? lerEtag(r.etag, "tempoEspera") ?? 2000) || 2000;
  }
  throw new Error("A Receita ainda está gerando o relatório. Tente de novo em um minuto.");
}

function erroIntegra(prefixo: string, r: RespostaIntegra): string {
  const msgs = r.mensagens.map((m) => `${m.codigo}: ${m.texto}`).join(" ");
  const procuracao = /procura/i.test(msgs) ? " Confira se o cliente deu procuração eletrônica ao escritório no e-CAC." : "";
  return `${prefixo} (HTTP ${r.status}). ${msgs}${procuracao}`.trim();
}

// ---------- PGMEI: dívida ativa do MEI ----------

/**
 * Converte a resposta do PGMEI DIVIDAATIVA24 em débitos.
 * Formato: [{ periodoApuracao, tributo, valor, enteFederado, situacaoDebito }].
 */
export function mapearDividaAtivaPgmei(dados: unknown, ano: number): Debito[] {
  const lista = Array.isArray(dados) ? dados : [];
  return lista
    .filter((o): o is Record<string, unknown> => !!o && typeof o === "object" && typeof (o as Record<string, unknown>).valor === "number")
    .map((o) => {
      const pa = String(o.periodoApuracao ?? ano);
      return {
        tipo: "DIVIDA_ATIVA" as const,
        descricao: `DAS MEI ${o.tributo ?? ""} em dívida ativa`.replace(/\s+/g, " ").trim(),
        competencia: /^\d{6}$/.test(pa) ? `${pa.slice(4)}/${pa.slice(0, 4)}` : pa,
        valor: Number(o.valor),
        situacao: o.situacaoDebito ? String(o.situacaoDebito).replace(/\s+/g, " ") : undefined,
        origem: "integra" as const,
      };
    });
}

export async function buscarDebitosMei(cnpjCliente: string, anos: number[]) {
  const debitos: Debito[] = [];
  for (const ano of anos) {
    const resposta = await chamar(cnpjCliente, SERVICOS.pgmeiDividaAtiva, { anoCalendario: String(ano) });
    if (resposta.status === 200) debitos.push(...mapearDividaAtivaPgmei(resposta.dados, ano));
  }
  return { debitos };
}
