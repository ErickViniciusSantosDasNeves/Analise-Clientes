import { NextResponse } from "next/server";
import { extrairLinhasPdf } from "@/lib/relatorio/pdf-linhas";
import { debitosDoRelatorio, lerSituacaoFiscal } from "@/lib/relatorio/situacao-fiscal";

export const runtime = "nodejs";

const TAMANHO_MAXIMO = 5 * 1024 * 1024;

/** Lê o PDF do Relatório de Situação Fiscal. O arquivo fica só na memória; nada é gravado. */
export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  const arquivo = form?.get("arquivo");
  if (!(arquivo instanceof File)) return NextResponse.json({ erro: "Envie o PDF no campo 'arquivo'." }, { status: 400 });
  if (arquivo.size > TAMANHO_MAXIMO) return NextResponse.json({ erro: "Arquivo acima de 5 MB." }, { status: 413 });
  const dados = new Uint8Array(await arquivo.arrayBuffer());
  if (new TextDecoder().decode(dados.slice(0, 5)) !== "%PDF-") return NextResponse.json({ erro: "O arquivo não é um PDF." }, { status: 400 });
  try {
    const relatorio = lerSituacaoFiscal(await extrairLinhasPdf(dados));
    return NextResponse.json({ relatorio, debitos: debitosDoRelatorio(relatorio) });
  } catch {
    return NextResponse.json({ erro: "Não foi possível ler o PDF. Confira se é o Relatório de Situação Fiscal do e-CAC." }, { status: 422 });
  }
}
