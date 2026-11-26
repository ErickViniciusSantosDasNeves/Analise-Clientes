import type { Debito, SituacaoCadastral, TipoDebito } from "../motor/tipos";

/**
 * Leitura do "Relatório de Situação Fiscal" (Informações de Apoio para Emissão de
 * Certidão) emitido no e-CAC / Portal de Serviços da Receita Federal.
 *
 * Trabalha sobre as linhas de texto já extraídas do PDF (ver pdf-linhas.ts),
 * para poder ser testado sem PDF real.
 */

export type SecaoPendencia = "SIEF" | "SIMPLES" | "SIMEI" | "SIDA" | "SISPAR" | "OMISSAO" | "OUTRA";

export interface PendenciaRelatorio {
  secao: SecaoPendencia;
  tituloSecao: string;
  receita: string;
  periodo?: string;
  vencimento?: string;
  valorOriginal?: number;
  saldoDevedor?: number;
  multa?: number;
  juros?: number;
  consolidado?: number;
  situacao?: string;
  /** Inscrição na dívida ativa, número de conta de parcelamento ou processo. */
  identificador?: string;
  detalhe?: string;
  exigibilidadeSuspensa: boolean;
}

export interface RelatorioSituacaoFiscal {
  cnpj?: string;
  razaoSocial?: string;
  emitidoEm?: string;
  situacao?: SituacaoCadastral;
  naturezaJuridica?: string;
  abertura?: string;
  cnae?: string;
  porte?: string;
  periodosSimples: { inclusao: string; exclusao?: string }[];
  certidao?: { tipo: string; validade?: string };
  pendencias: PendenciaRelatorio[];
  avisos: string[];
}

const DIN = String.raw`\d{1,3}(?:\.\d{3})*,\d{2}`;
const DATA = String.raw`\d{2}\/\d{2}\/\d{4}`;
const RE_DEBITO = new RegExp(
  String.raw`^(.+?)\s{2,}(\S+(?: \S+)?)\s{2,}(${DATA})\s{2,}(${DIN})\s{2,}(${DIN})\s{2,}(${DIN})\s{2,}(${DIN})\s{2,}(${DIN})(?:\s{2,}(.+))?$`,
);
const RE_INSCRICAO = new RegExp(String.raw`^(\d{2}\.\d\.\d{2}\.\d{6}-\d{2})\s{2,}(.+?)\s{2,}(${DATA})(?:\s{2,}(.*))?$`);
const RE_CONTA = /^(\d{6,})\s{2,}(.+)$/;
const RE_TITULO = /^_*\s*([A-ZÀ-Úa-zà-ú][^_]*?)\s*_{5,}\s*$|^_{5,}\s*([^_]+?)\s*_{5,}$/;

export const numeroBr = (s: string) => Number(s.replace(/\./g, "").replace(",", "."));

function classificar(titulo: string): SecaoPendencia {
  const t = titulo.toUpperCase();
  if (t.includes("SIDA")) return "SIDA";
  if (t.includes("SISPAR") || t.includes("PARCELAMENTO")) return "SISPAR";
  if (t.includes("OMISS")) return "OMISSAO";
  if (t.includes("SIMEI") || t.includes("MEI")) return "SIMEI";
  if (t.includes("SIMPLES")) return "SIMPLES";
  if (t.includes("SIEF") || t.includes("DÉBITO") || t.includes("DEBITO")) return "SIEF";
  return "OUTRA";
}

const SITUACOES: SituacaoCadastral[] = ["ATIVA", "INAPTA", "SUSPENSA", "BAIXADA", "NULA"];

export function lerSituacaoFiscal(linhasBrutas: string[]): RelatorioSituacaoFiscal {
  const r: RelatorioSituacaoFiscal = { periodosSimples: [], pendencias: [], avisos: [] };

  // Remove o cabeçalho que se repete em cada página.
  const linhas: string[] = [];
  let noCabecalho = false;
  for (const bruta of linhasBrutas) {
    const l = bruta.trim();
    if (!l) continue;
    if (l.startsWith("MINISTÉRIO DA FAZENDA")) {
      noCabecalho = true;
      const em = l.match(/(\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}:\d{2})/);
      if (em && !r.emitidoEm) r.emitidoEm = em[1];
    }
    if (noCabecalho) {
      const em = l.match(/(\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}:\d{2})/);
      if (em && !r.emitidoEm) r.emitidoEm = em[1];
      const nome = l.match(/^CNPJ:\s*([\d.]{10})\s+-\s+(.+)$/);
      if (nome) {
        r.razaoSocial ??= nome[2].trim();
        noCabecalho = false;
      }
      continue;
    }
    linhas.push(l);
  }

  let titulo = "";
  let secao: SecaoPendencia | null = null;
  let suspensa = false;
  let naListaSimples = false;
  let ultima: PendenciaRelatorio | undefined;

  for (const l of linhas) {
    if (/^_+$/.test(l)) {
      secao = null;
      continue;
    }
    if (/^Final do Relat/i.test(l)) break;
    const t = l.match(RE_TITULO);
    if (t || l.startsWith("Pendência") || /Exigibilidade Suspensa/.test(l)) {
      const nome = (t?.[1] ?? t?.[2] ?? l).replace(/_+/g, "").trim();
      if (!nome || /^Final do Relat/.test(nome)) {
        secao = null;
        continue;
      }
      titulo = nome;
      const ehPendencia = /Pend[êe]ncia|Exigibilidade|Inscri[çc][ãa]o|Parcelamento|Omiss/i.test(nome);
      secao = ehPendencia ? classificar(nome) : null;
      suspensa = /Suspensa/i.test(nome);
      naListaSimples = false;
      ultima = undefined;
      continue;
    }

    // Dados cadastrais
    if (!secao) {
      let m: RegExpMatchArray | null;
      if (!r.cnpj && (m = l.match(/^CNPJ:\s*(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})$/))) r.cnpj = m[1].replace(/\D/g, "");
      if ((m = l.match(/^Situação:\s*([A-ZÀ-Ú ]+)$/))) {
        const s = m[1].trim() as SituacaoCadastral;
        r.situacao = SITUACOES.includes(s) ? s : "DESCONHECIDA";
      }
      if ((m = l.match(/^Natureza Jurídica:\s*(.+?)(?:\s{2,}Data de Abertura:\s*(\S+))?$/))) {
        r.naturezaJuridica = m[1];
        if (m[2]) r.abertura = m[2];
      }
      if ((m = l.match(/^CNAE:\s*(.+)$/))) r.cnae = m[1];
      if ((m = l.match(/^Porte da Empresa:\s*(.+)$/))) r.porte = m[1];
      if (/^Opção pelo Simples/i.test(l)) naListaSimples = true;
      else if (naListaSimples && (m = l.match(new RegExp(`^(${DATA})(?:\\s{2,}(${DATA}))?$`)))) {
        r.periodosSimples.push({ inclusao: m[1], exclusao: m[2] });
      } else if (naListaSimples && !/^Inclus/.test(l)) naListaSimples = false;
      if ((m = l.match(/^(Certidão [^:]+):\s*\S+.*?Data de Validade:\s*(\S+)/))) r.certidao = { tipo: m[1], validade: m[2] };
      continue;
    }

    // Linha de situação, notificação ou modalidade: completa a pendência anterior
    let m: RegExpMatchArray | null;
    if ((m = l.match(/^Situação:\s*(.+)$/)) && ultima) {
      ultima.situacao = m[1].trim();
      continue;
    }
    if ((m = l.match(/^(Modalidade|Notificação de lançamento|Processo):\s*(.+)$/)) && ultima) {
      ultima.detalhe = [ultima.detalhe, `${m[1]}: ${m[2]}`].filter(Boolean).join(" · ");
      continue;
    }
    if (/^(CNPJ:|Receita\s|Inscrição\s|Conta$|Conta\s)/.test(l)) continue;

    if ((m = l.match(RE_DEBITO))) {
      const receita = m[1].trim();
      const secaoLinha: SecaoPendencia = /SIMEI|\bMEI\b/i.test(receita) ? "SIMEI" : /SIMPLES/i.test(receita) && secao === "SIEF" ? "SIMPLES" : secao;
      ultima = {
        secao: secaoLinha,
        tituloSecao: titulo,
        receita,
        periodo: m[2],
        vencimento: m[3],
        valorOriginal: numeroBr(m[4]),
        saldoDevedor: numeroBr(m[5]),
        multa: numeroBr(m[6]),
        juros: numeroBr(m[7]),
        consolidado: numeroBr(m[8]),
        situacao: m[9]?.trim(),
        exigibilidadeSuspensa: suspensa,
      };
      const conferencia = ultima.saldoDevedor! + ultima.multa! + ultima.juros!;
      if (Math.abs(conferencia - ultima.consolidado!) > 0.05) {
        r.avisos.push(`${receita} ${m[2]}: saldo + multa + juros (${conferencia.toFixed(2)}) difere do consolidado (${ultima.consolidado!.toFixed(2)}).`);
      }
      r.pendencias.push(ultima);
      continue;
    }
    if ((m = l.match(RE_INSCRICAO))) {
      const valores = (m[4] ?? "").match(new RegExp(DIN, "g"));
      ultima = {
        secao: "SIDA",
        tituloSecao: titulo,
        receita: m[2].trim(),
        identificador: m[1],
        vencimento: m[3],
        consolidado: valores ? numeroBr(valores[valores.length - 1]) : undefined,
        detalhe: m[4]?.replace(new RegExp(DIN, "g"), "").trim() || undefined,
        exigibilidadeSuspensa: suspensa,
      };
      r.pendencias.push(ultima);
      continue;
    }
    if (secao === "SISPAR" && (m = l.match(RE_CONTA))) {
      ultima = { secao: "SISPAR", tituloSecao: titulo, receita: m[2].replace(/\s{2,}/g, " ").trim(), identificador: m[1], exigibilidadeSuspensa: suspensa };
      r.pendencias.push(ultima);
      continue;
    }
    if (secao === "OMISSAO" && (m = l.match(/^(.+?)\s{2,}(\d{2}\/\d{4}|\d{4})(?:\s{2,}(.+))?$/))) {
      ultima = { secao: "OMISSAO", tituloSecao: titulo, receita: m[1].trim(), periodo: m[2], detalhe: m[3], exigibilidadeSuspensa: false };
      r.pendencias.push(ultima);
      continue;
    }
    // Continuação do nome da receita quebrado em duas linhas (ex.: "1507-SIMPLES" / "NACIONAL")
    if (ultima && /^[A-ZÀ-Ú. ]+$/.test(l) && l.length < 30) {
      ultima.receita = `${ultima.receita} ${l}`;
      continue;
    }
    r.avisos.push(`Linha não reconhecida em "${titulo}": ${l.slice(0, 120)}`);
  }

  if (!r.cnpj) r.avisos.push("CNPJ não encontrado: confira se o arquivo é o Relatório de Situação Fiscal.");
  return r;
}

function tipoDebito(p: PendenciaRelatorio): TipoDebito {
  if (p.secao === "SIDA") return "DIVIDA_ATIVA";
  if (p.secao === "SISPAR") return "PARCELAMENTO";
  if (p.secao === "OMISSAO") {
    const t = p.receita + " " + p.tituloSecao;
    if (/DASN|SIMEI/i.test(t)) return "DASN_OMISSA";
    if (/PGDAS/i.test(t)) return "PGDAS_OMISSA";
    if (/DEFIS/i.test(t)) return "DEFIS_OMISSA";
    return "OUTRO";
  }
  if (p.secao === "SIMEI" || p.secao === "SIMPLES") return "DAS";
  return "OUTRO";
}

/** Converte as pendências do relatório em débitos para o mapa de pendências. */
export function debitosDoRelatorio(r: RelatorioSituacaoFiscal): Debito[] {
  return r.pendencias.map((p) => ({
    tipo: tipoDebito(p),
    orgao: p.secao === "SIDA" ? ("PGFN" as const) : ("RECEITA" as const),
    descricao: [p.receita, p.identificador].filter(Boolean).join(" · "),
    competencia: p.periodo,
    vencimento: p.vencimento,
    valorOriginal: p.saldoDevedor ?? p.valorOriginal,
    multa: p.multa,
    juros: p.juros,
    valor: p.consolidado ?? 0,
    situacao: [p.situacao, p.exigibilidadeSuspensa ? "exigibilidade suspensa" : undefined, p.detalhe].filter(Boolean).join(" · ") || undefined,
    origem: "upload" as const,
  }));
}
