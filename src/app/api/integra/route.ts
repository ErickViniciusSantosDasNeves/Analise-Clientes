import { NextResponse } from "next/server";
import { integraConfigurado } from "@/lib/fontes/integra-contador";

/** Informa à tela se a busca automática na Receita está disponível (sem expor credenciais). */
export function GET() {
  return NextResponse.json({ configurado: integraConfigurado() });
}
