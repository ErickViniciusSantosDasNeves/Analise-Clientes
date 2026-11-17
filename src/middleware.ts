import { NextResponse, type NextRequest } from "next/server";

/**
 * Acesso restrito à equipe do escritório: usuário e senha definidos nas variáveis
 * APP_USUARIO e APP_SENHA. Sem elas, o app não abre (fechado por padrão).
 */
export function middleware(req: NextRequest) {
  const usuario = process.env.APP_USUARIO;
  const senha = process.env.APP_SENHA;
  if (!usuario || !senha) {
    return new NextResponse("Acesso não configurado. Defina APP_USUARIO e APP_SENHA no servidor.", { status: 503 });
  }
  const auth = req.headers.get("authorization") ?? "";
  const [tipo, valor] = auth.split(" ");
  if (tipo === "Basic" && valor) {
    const [u, ...resto] = atob(valor).split(":");
    if (iguais(u, usuario) && iguais(resto.join(":"), senha)) return NextResponse.next();
  }
  return new NextResponse("Acesso restrito.", { status: 401, headers: { "WWW-Authenticate": 'Basic realm="Analise de Clientes", charset="UTF-8"' } });
}

/** Comparação em tempo constante para não vazar a senha pelo tempo de resposta. */
function iguais(a: string, b: string): boolean {
  let dif = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) dif |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return dif === 0;
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
