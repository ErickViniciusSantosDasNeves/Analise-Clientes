import { NextResponse } from "next/server";
import { cnpjValido, limparCnpj } from "@/lib/cnpj";
import { emitirSituacaoFiscal, integraConfigurado } from "@/lib/fontes/integra-contador";
import { extrairLinhasPdf } from "@/lib/relatorio/pdf-linhas";
import { debitosDoRelatorio, lerSituacaoFiscal } from "@/lib/relatorio/situacao-fiscal";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Busca o Relatório de Situação Fiscal direto da Receita (Integra Contador / SITFIS) e lê as pendências. */
export async function POST(req: Request) {
  const corpo = (await req.json().catch(() => ({}))) as { cnpj?: string };
  const cnpj = limparCnpj(corpo.cnpj ?? "");
  if (!cnpjValido(cnpj)) return NextResponse.json({ erro: "CNPJ inválido." }, { status: 400 });
  if (!integraConfigurado()) {
    return NextResponse.json({ erro: "Integra Contador ainda não configurado no servidor. Use o upload do PDF." }, { status: 501 });
  }
  try {
    const { pdf } = await emitirSituacaoFiscal(cnpj);
    const relatorio = lerSituacaoFiscal(await extrairLinhasPdf(pdf));
    return NextResponse.json({ relatorio, debitos: debitosDoRelatorio(relatorio), pdfBase64: Buffer.from(pdf).toString("base64") });
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 502 });
  }
}
