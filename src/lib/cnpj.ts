/**
 * CNPJ numérico e alfanumérico (IN RFB 2.229/2024, a partir de julho/2026):
 * 12 posições com letras ou números e 2 dígitos verificadores numéricos.
 */
export function limparCnpj(v: string): string {
  return v.toUpperCase().replace(/[^0-9A-Z]/g, "");
}

const valor = (ch: string) => ch.charCodeAt(0) - 48;

function digito(base: string): number {
  let peso = 2;
  let soma = 0;
  for (let i = base.length - 1; i >= 0; i--) {
    soma += valor(base[i]) * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }
  const r = soma % 11;
  return r < 2 ? 0 : 11 - r;
}

export function cnpjValido(v: string): boolean {
  const c = limparCnpj(v);
  if (!/^[0-9A-Z]{12}\d{2}$/.test(c) || /^(\d)\1+$/.test(c)) return false;
  const d1 = digito(c.slice(0, 12));
  const d2 = digito(c.slice(0, 12) + d1);
  return c.endsWith(`${d1}${d2}`);
}

export function formatarCnpj(v: string): string {
  const c = limparCnpj(v);
  return `${c.slice(0, 2)}.${c.slice(2, 5)}.${c.slice(5, 8)}/${c.slice(8, 12)}-${c.slice(12)}`;
}
