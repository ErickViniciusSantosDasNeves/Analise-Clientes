import https from "node:https";
import type { Debito } from "../motor/tipos";

/**
 * Cliente do Integra Contador (Serpro).
 *
 * Autenticação: OAuth2 client_credentials com certificado e-CNPJ A1 do escritório (mTLS).
 * Cada cliente consultado precisa ter dado procuração eletrônica ao escritório no e-CAC.
 *
 * As credenciais vêm só de variáveis de ambiente (ver .env.example). Nunca do navegador.
 *
 * IMPORTANTE: os códigos de serviço e o formato do campo "dados" devem ser conferidos
 * no catálogo atual do Serpro na primeira consulta real; o mapeamento de débitos abaixo
 * é tolerante e guarda a resposta original para auditoria.
 */

const URL_AUTH = "https://autenticacao.sapi.serpro.gov.br/authenticate";
const URL_BASE = "https://gateway.apiserpro.serpro.gov.br/integra-contador/v1";

export const SERVICOS = {
  pgmeiDividaAtiva: { idSistema: "PGMEI", idServico: "DIVIDAATIVA24", versaoSistema: "1.0" },
} as const;

interface Config {
  consumerKey: string;
  consumerSecret: string;
  pfx: Buffer;
  senha: string;
  cnpjContratante: string;
}

export function integraConfigurado(): boolean {
  const e = process.env;
  return Boolean(e.INTEGRA_CONSUMER_KEY && e.INTEGRA_CONSUMER_SECRET && e.INTEGRA_CERT_PFX_BASE64 && e.INTEGRA_CNPJ_CONTRATANTE);
}

function lerConfig(): Config {
  if (!integraConfigurado()) throw new Error("Integra Contador não configurado no servidor.");
  const e = process.env;
  return {
    consumerKey: e.INTEGRA_CONSUMER_KEY!,
    consumerSecret: e.INTEGRA_CONSUMER_SECRET!,
    pfx: Buffer.from(e.INTEGRA_CERT_PFX_BASE64!, "base64"),
    senha: e.INTEGRA_CERT_SENHA ?? "",
    cnpjContratante: e.INTEGRA_CNPJ_CONTRATANTE!.replace(/\D/g, ""),
  };
}

function postar(url: string, headers: Record<string, string>, corpo: string, cfg: Config): Promise<{ status: number; corpo: string }> {
  return new Promise((resolve, reject) => {
    const req = https.request(
      url,
      { method: "POST", headers: { ...headers, "Content-Length": Buffer.byteLength(corpo).toString() }, pfx: cfg.pfx, passphrase: cfg.senha, timeout: 30000 },
      (res) => {
        let dados = "";
        res.setEncoding("utf8");
        res.on("data", (c) => (dados += c));
        res.on("end", () => resolve({ status: res.statusCode ?? 0, corpo: dados }));
      },
    );
    req.on("timeout", () => req.destroy(new Error("Tempo esgotado no Integra Contador")));
    req.on("error", reject);
    req.end(corpo);
  });
}

let tokenCache: { access: string; jwt: string; expira: number } | undefined;

async function autenticar(cfg: Config) {
  if (tokenCache && tokenCache.expira > Date.now() + 60_000) return tokenCache;
  const basic = Buffer.from(`${cfg.consumerKey}:${cfg.consumerSecret}`).toString("base64");
  const r = await postar(
    URL_AUTH,
    { Authorization: `Basic ${basic}`, "Role-Type": "TERCEIROS", "Content-Type": "application/x-www-form-urlencoded" },
    "grant_type=client_credentials",
    cfg,
  );
  if (r.status !== 200) throw new Error(`Falha na autenticação do Integra Contador (HTTP ${r.status}).`);
  const j = JSON.parse(r.corpo);
  tokenCache = { access: j.access_token, jwt: j.jwt_token, expira: Date.now() + Number(j.expires_in ?? 3600) * 1000 };
  return tokenCache;
}

export interface RespostaIntegra {
  status: number;
  mensagens: { codigo: string; texto: string }[];
  dados: unknown;
}

export async function consultar(
  cnpjCliente: string,
  servico: { idSistema: string; idServico: string; versaoSistema: string },
  dados: Record<string, unknown>,
): Promise<RespostaIntegra> {
  const cfg = lerConfig();
  const tk = await autenticar(cfg);
  const pedido = {
    contratante: { numero: cfg.cnpjContratante, tipo: 2 },
    autorPedidoDados: { numero: cfg.cnpjContratante, tipo: 2 },
    contribuinte: { numero: cnpjCliente, tipo: 2 },
    pedidoDados: { ...servico, dados: JSON.stringify(dados) },
  };
  const r = await postar(
    `${URL_BASE}/Consultar`,
    { Authorization: `Bearer ${tk.access}`, jwt_token: tk.jwt, "Content-Type": "application/json", Accept: "application/json" },
    JSON.stringify(pedido),
    cfg,
  );
  let j: { mensagens?: RespostaIntegra["mensagens"]; dados?: string } = {};
  try {
    j = JSON.parse(r.corpo);
  } catch {
    /* corpo não JSON */
  }
  let dadosParse: unknown = j.dados;
  if (typeof j.dados === "string") {
    try {
      dadosParse = JSON.parse(j.dados);
    } catch {
      dadosParse = j.dados;
    }
  }
  return { status: r.status, mensagens: j.mensagens ?? [], dados: dadosParse };
}

/**
 * Converte a resposta da dívida ativa do PGMEI em débitos.
 * Procura listas de objetos com algum campo de valor; o formato exato deve ser
 * conferido na primeira consulta real (a resposta original segue junto).
 */
export function mapearDividaAtivaPgmei(dados: unknown, ano: number): Debito[] {
  const itens: Record<string, unknown>[] = [];
  const visitar = (v: unknown) => {
    if (Array.isArray(v)) v.forEach(visitar);
    else if (v && typeof v === "object") {
      const o = v as Record<string, unknown>;
      if (Object.keys(o).some((k) => /valor|total/i.test(k) && typeof o[k] === "number")) itens.push(o);
      else Object.values(o).forEach(visitar);
    }
  };
  visitar(dados);
  return itens.map((o) => {
    const chaveValor = Object.keys(o).find((k) => /total/i.test(k) && typeof o[k] === "number") ?? Object.keys(o).find((k) => /valor/i.test(k) && typeof o[k] === "number")!;
    const periodo = Object.entries(o).find(([k]) => /periodo|competencia|pa$/i.test(k))?.[1];
    return {
      tipo: "DIVIDA_ATIVA" as const,
      descricao: "DAS MEI inscrito em dívida ativa",
      competencia: periodo ? String(periodo) : String(ano),
      valor: Number(o[chaveValor]),
      origem: "integra" as const,
    };
  });
}

export async function buscarDebitosMei(cnpjCliente: string, anos: number[]) {
  const debitos: Debito[] = [];
  const respostas: { ano: number; resposta: RespostaIntegra }[] = [];
  for (const ano of anos) {
    const resposta = await consultar(cnpjCliente, SERVICOS.pgmeiDividaAtiva, { anoCalendario: String(ano) });
    respostas.push({ ano, resposta });
    if (resposta.status === 200) debitos.push(...mapearDividaAtivaPgmei(resposta.dados, ano));
  }
  return { debitos, respostas };
}
