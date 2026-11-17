/**
 * Extrai o texto de um PDF em linhas, na ordem visual (de cima para baixo,
 * da esquerda para a direita), já considerando páginas giradas.
 * Colunas separadas por dois espaços. Roda no servidor; o arquivo não é gravado.
 */
export async function extrairLinhasPdf(dados: Uint8Array): Promise<string[]> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({ data: dados, isEvalSupported: false, verbosity: 0 }).promise;
  const linhas: string[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const pagina = await doc.getPage(p);
    const vp = pagina.getViewport({ scale: 1 });
    const conteudo = await pagina.getTextContent();
    const porY = new Map<number, { x: number; fim: number; texto: string; largura: number }[]>();
    for (const item of conteudo.items) {
      if (!("str" in item) || item.str === "") continue;
      const m = pdfjs.Util.transform(vp.transform, item.transform);
      const y = Math.round(m[5]);
      const chave = [...porY.keys()].find((k) => Math.abs(k - y) <= 2) ?? y;
      const lista = porY.get(chave) ?? [];
      lista.push({ x: m[4], fim: m[4] + item.width, texto: item.str, largura: item.width });
      porY.set(chave, lista);
    }
    for (const y of [...porY.keys()].sort((a, b) => a - b)) {
      const itens = porY.get(y)!.sort((a, b) => a.x - b.x);
      let linha = "";
      let fimAnterior = -Infinity;
      for (const it of itens) {
        const gap = it.x - fimAnterior;
        if (linha && gap > 8) linha += "  ";
        else if (linha && gap > 1 && !linha.endsWith(" ")) linha += " ";
        if (!it.texto.trim()) {
          if (it.largura > 8) linha = linha.trimEnd() + "  ";
          else if (!linha.endsWith(" ")) linha += " ";
        } else linha += it.texto;
        fimAnterior = it.fim;
      }
      if (linha.trim()) linhas.push(linha.trim());
    }
    pagina.cleanup();
  }
  await doc.destroy();
  return linhas;
}
