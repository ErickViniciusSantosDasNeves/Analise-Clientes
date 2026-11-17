import type { Debito, Orgao } from "./tipos";
import { valorDebito } from "./mei";
import { arred } from "./calculos";

export const ORGAOS: { codigo: Orgao; nome: string; onde: string }[] = [
  { codigo: "RECEITA", nome: "Receita Federal", onde: "e-CAC" },
  { codigo: "PGFN", nome: "Dívida ativa da União", onde: "PGFN / Regularize" },
  { codigo: "PREFEITURA", nome: "Prefeitura", onde: "ISS, taxas e dívida ativa municipal" },
  { codigo: "ESTADO", nome: "Estado", onde: "ICMS e dívida ativa estadual" },
];

export function orgaoDe(d: Debito): Orgao {
  return d.orgao ?? (d.tipo === "DIVIDA_ATIVA" ? "PGFN" : "RECEITA");
}

export interface GrupoOrgao {
  orgao: Orgao;
  nome: string;
  onde: string;
  itens: { debito: Debito; indice: number }[];
  valorOriginal: number;
  multa: number;
  juros: number;
  total: number;
  /** Itens sem a abertura em principal, multa e juros (só o total). */
  semDetalhe: number;
}

/** Agrupa os débitos por órgão, na ordem Receita, PGFN, Prefeitura, Estado, só com os que têm itens. */
export function agruparPorOrgao(debitos: Debito[]): GrupoOrgao[] {
  return ORGAOS.map(({ codigo, nome, onde }) => {
    const itens = debitos.map((debito, indice) => ({ debito, indice })).filter((x) => orgaoDe(x.debito) === codigo);
    const g: GrupoOrgao = { orgao: codigo, nome, onde, itens, valorOriginal: 0, multa: 0, juros: 0, total: 0, semDetalhe: 0 };
    for (const { debito: d } of itens) {
      g.total += valorDebito(d);
      if (d.valorOriginal === undefined) g.semDetalhe++;
      g.valorOriginal += d.valorOriginal ?? 0;
      g.multa += d.multa ?? 0;
      g.juros += d.juros ?? 0;
    }
    g.total = arred(g.total);
    g.valorOriginal = arred(g.valorOriginal);
    g.multa = arred(g.multa);
    g.juros = arred(g.juros);
    return g;
  }).filter((g) => g.itens.length > 0);
}
