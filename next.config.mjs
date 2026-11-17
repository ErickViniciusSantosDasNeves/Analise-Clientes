/** @type {import('next').NextConfig} */
const nextConfig = {
  // pdf.js roda no servidor para ler o Relatório de Situação Fiscal.
  serverExternalPackages: ["pdfjs-dist"],
  outputFileTracingIncludes: {
    "/api/relatorio": ["./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs"],
  },
};
export default nextConfig;
