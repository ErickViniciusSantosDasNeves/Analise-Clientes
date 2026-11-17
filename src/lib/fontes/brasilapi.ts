import type { SituacaoCadastral } from "../motor/tipos";

/** Dados cadastrais que a análise usa, independentes da fonte. */
export interface Cadastro {
  cnpj: string;
  razaoSocial: string;
  nomeFantasia?: string;
  situacao: SituacaoCadastral;
  dataSituacao?: string;
  motivoSituacao?: string;
  abertura?: string;
  naturezaJuridica?: string;
  cnaePrincipal: { codigo: string; descricao: string };
  cnaesSecundarios: { codigo: string; descricao: string }[];
  optanteSimples?: boolean;
  optanteMei?: boolean;
  municipio?: string;
  uf?: string;
  socios: { nome: string; qualificacao: string }[];
  fonte: string;
  consultadoEm: string;
}

const SITUACOES: Record<string, SituacaoCadastral> = {
  ATIVA: "ATIVA",
  INAPTA: "INAPTA",
  SUSPENSA: "SUSPENSA",
  BAIXADA: "BAIXADA",
  NULA: "NULA",
};

// Formato da resposta pública da BrasilAPI (/api/cnpj/v1/{cnpj}).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapearBrasilApi(j: any): Cadastro {
  const cnae = (codigo: unknown, descricao: unknown) => ({ codigo: String(codigo ?? ""), descricao: String(descricao ?? "") });
  return {
    cnpj: String(j.cnpj),
    razaoSocial: j.razao_social ?? "",
    nomeFantasia: j.nome_fantasia || undefined,
    situacao: SITUACOES[String(j.descricao_situacao_cadastral ?? "").toUpperCase()] ?? "DESCONHECIDA",
    dataSituacao: j.data_situacao_cadastral ?? undefined,
    motivoSituacao: j.descricao_motivo_situacao_cadastral || undefined,
    abertura: j.data_inicio_atividade ?? undefined,
    naturezaJuridica: j.natureza_juridica ?? undefined,
    cnaePrincipal: cnae(j.cnae_fiscal, j.cnae_fiscal_descricao),
    cnaesSecundarios: Array.isArray(j.cnaes_secundarios)
      ? j.cnaes_secundarios.filter((c: { codigo: number }) => c.codigo).map((c: { codigo: number; descricao: string }) => cnae(c.codigo, c.descricao))
      : [],
    optanteSimples: j.opcao_pelo_simples ?? undefined,
    optanteMei: j.opcao_pelo_mei ?? undefined,
    municipio: j.municipio ?? undefined,
    uf: j.uf ?? undefined,
    socios: Array.isArray(j.qsa) ? j.qsa.map((s: { nome_socio: string; qualificacao_socio: string }) => ({ nome: s.nome_socio, qualificacao: s.qualificacao_socio })) : [],
    fonte: "BrasilAPI (base pública da Receita Federal)",
    consultadoEm: new Date().toISOString(),
  };
}

export async function consultarCadastro(cnpj: string): Promise<Cadastro> {
  const r = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`, { headers: { Accept: "application/json" }, cache: "no-store" });
  if (r.status === 404) throw new Error("CNPJ não encontrado na base pública.");
  if (!r.ok) throw new Error(`Consulta pública indisponível (HTTP ${r.status}). Tente de novo em instantes.`);
  return mapearBrasilApi(await r.json());
}
