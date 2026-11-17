import { NextResponse } from "next/server";
import { cnpjValido, limparCnpj } from "@/lib/cnpj";
import { consultarCadastro } from "@/lib/fontes/brasilapi";

export async function GET(_req: Request, ctx: { params: Promise<{ cnpj: string }> }) {
  const { cnpj } = await ctx.params;
  const c = limparCnpj(cnpj);
  if (!cnpjValido(c)) return NextResponse.json({ erro: "CNPJ inválido." }, { status: 400 });
  try {
    return NextResponse.json(await consultarCadastro(c));
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 502 });
  }
}
