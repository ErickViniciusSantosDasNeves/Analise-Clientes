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

/** Fontes públicas com o mesmo formato de resposta; a segunda é usada se a primeira falhar. */
const FONTES = [
  { nome: "BrasilAPI (base pública da Receita Federal)", url: (c: string) => `https://brasilapi.com.br/api/cnpj/v1/${c}` },
  { nome: "Minha Receita (base pública da Receita Federal)", url: (c: string) => `https://minhareceita.org/${c}` },
];

export async function consultarCadastro(cnpj: string): Promise<Cadastro> {
  let ultimoErro = "Consulta pública indisponível. Tente de novo em instantes.";
  for (const fonte of FONTES) {
    try {
      const r = await fetch(fonte.url(cnpj), { headers: { Accept: "application/json" }, cache: "no-store", signal: AbortSignal.timeout(10000) });
      if (r.status === 404) throw new Error("CNPJ não encontrado na base pública.");
      if (!r.ok) {
        ultimoErro = `Consulta pública indisponível (HTTP ${r.status}). Tente de novo em instantes.`;
        continue;
      }
      return { ...mapearBrasilApi(await r.json()), fonte: fonte.nome };
    } catch (e) {
      if ((e as Error).message.startsWith("CNPJ não encontrado")) throw e;
      ultimoErro = `Consulta pública indisponível (${(e as Error).message}). Tente de novo em instantes.`;
    }
  }
  throw new Error(ultimoErro);
}
