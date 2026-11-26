import { NextResponse } from "next/server";
import { cnpjValido, limparCnpj } from "@/lib/cnpj";
import { integraConfigurado } from "@/lib/fontes/integra-contador";
import { buscarObrigacoesSimples, debitosDeOmissoes } from "@/lib/fontes/simples-integra";
import { hojeIso } from "@/lib/motor/parametros";

export const runtime = "nodejs";
export const maxDuration = 60;

/** PGDAS-D, DEFIS e parcelamentos do Simples pelo Integra Contador. `inicio` = data de opção (DD/MM/AAAA ou AAAA-MM). */
export async function POST(req: Request) {
  const corpo = (await req.json().catch(() => ({}))) as { cnpj?: string; inicio?: string };
  const cnpj = limparCnpj(corpo.cnpj ?? "");
  if (!cnpjValido(cnpj)) return NextResponse.json({ erro: "CNPJ inválido." }, { status: 400 });
  if (!integraConfigurado()) {
    return NextResponse.json({ erro: "Integra Contador ainda não configurado no servidor. Lance as omissões à mão ou use o relatório de situação fiscal." }, { status: 501 });
  }
  const hoje = hojeIso();
  const i = corpo.inicio ?? "";
  const br = i.match(/^\d{2}\/(\d{2})\/(\d{4})$/);
  const iso = i.match(/^(\d{4})-(\d{2})/);
  const inicio = br ? `${br[2]}${br[1]}` : iso ? `${iso[1]}${iso[2]}` : `${Number(hoje.slice(0, 4)) - 5}01`;
  try {
    const o = await buscarObrigacoesSimples(cnpj, inicio, hoje);
    return NextResponse.json({ ...o, debitos: debitosDeOmissoes(o, hoje) });
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 502 });
  }
}
