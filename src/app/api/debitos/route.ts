import { NextResponse } from "next/server";
import { cnpjValido, limparCnpj } from "@/lib/cnpj";
import { buscarDebitosMei, integraConfigurado } from "@/lib/fontes/integra-contador";

export async function POST(req: Request) {
  const corpo = (await req.json().catch(() => ({}))) as { cnpj?: string; anos?: number[] };
  const cnpj = limparCnpj(corpo.cnpj ?? "");
  if (!cnpjValido(cnpj)) return NextResponse.json({ erro: "CNPJ inválido." }, { status: 400 });
  if (!integraConfigurado()) {
    return NextResponse.json(
      { erro: "Integra Contador ainda não configurado no servidor. Lance os débitos manualmente ou pelo relatório." },
      { status: 501 },
    );
  }
  const anoAtual = new Date().getFullYear();
  const anos = (corpo.anos?.length ? corpo.anos : [anoAtual - 4, anoAtual - 3, anoAtual - 2, anoAtual - 1, anoAtual]).slice(0, 6);
  try {
    return NextResponse.json(await buscarDebitosMei(cnpj, anos));
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 502 });
  }
}
