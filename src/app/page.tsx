"use client";

import { useEffect, useMemo, useState } from "react";
import { cnpjValido, formatarCnpj, limparCnpj } from "@/lib/cnpj";
import type { Cadastro } from "@/lib/fontes/brasilapi";
import type { RelatorioSituacaoFiscal } from "@/lib/relatorio/situacao-fiscal";
import type { Debito, Orgao, TipoDebito } from "@/lib/motor/tipos";
import { ORGAOS, agruparPorOrgao } from "@/lib/motor/debitos";
import { valorDebito } from "@/lib/motor/mei";
import AnaliseSimples from "./simples";

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const num = (s: string) => Number(s.replace(/\./g, "").replace(",", ".")) || 0;

const TIPOS: Record<TipoDebito, string> = {
  DAS: "DAS em aberto",
  DIVIDA_ATIVA: "Dívida ativa (PGFN)",
  DASN_OMISSA: "DASN-SIMEI não entregue",
  PGDAS_OMISSA: "PGDAS-D não transmitido",
  DEFIS_OMISSA: "DEFIS não entregue",
  PARCELAMENTO: "Saldo de parcelamento",
  OUTRO: "Outro",
};

const RESOLVE: Record<TipoDebito, string> = {
  DAS: "Pagar ou parcelar (PARCMEI ou PARCSN)",
  DIVIDA_ATIVA: "Pagar, parcelar ou transação no Regularize",
  DASN_OMISSA: "Entregar a declaração e pagar a multa",
  PGDAS_OMISSA: "Transmitir o PGDAS-D, pagar a MAED e o DAS do mês",
  DEFIS_OMISSA: "Entregar a DEFIS e pagar a multa",
  PARCELAMENTO: "Manter em dia ou quitar",
  OUTRO: "Analisar",
};

export default function Pagina() {
  const [cnpj, setCnpj] = useState("");
  const [cadastro, setCadastro] = useState<Cadastro | null>(null);
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);

  const [debitos, setDebitos] = useState<Debito[]>([]);
  const vazio = { orgao: "PREFEITURA" as Orgao, tipo: "OUTRO" as TipoDebito, descricao: "", competencia: "", vencimento: "", original: "", multa: "", juros: "" };
  const [novo, setNovo] = useState(vazio);
  const [msgMunicipal, setMsgMunicipal] = useState("");
  const [msgIntegra, setMsgIntegra] = useState("");
  const [integraAtivo, setIntegraAtivo] = useState(false);
  const [pdfReceita, setPdfReceita] = useState<string | null>(null);
  const [verSimples, setVerSimples] = useState(false);

  useEffect(() => {
    fetch("/api/integra")
      .then((r) => (r.ok ? r.json() : { configurado: false }))
      .then((j) => setIntegraAtivo(Boolean(j.configurado)))
      .catch(() => setIntegraAtivo(false));
  }, []);
  const [relatorio, setRelatorio] = useState<RelatorioSituacaoFiscal | null>(null);
  const [msgRelatorio, setMsgRelatorio] = useState("");

  async function lerRelatorio(arquivo: File | undefined) {
    if (!arquivo) return;
    setMsgRelatorio("Lendo o relatório...");
    try {
      const form = new FormData();
      form.append("arquivo", arquivo);
      const r = await fetch("/api/relatorio", { method: "POST", body: form });
      const j = await r.json();
      if (!r.ok) throw new Error(j.erro);
      const rel: RelatorioSituacaoFiscal = j.relatorio;
      setRelatorio(rel);
      if (!cnpj && rel.cnpj) setCnpj(formatarCnpj(rel.cnpj));
      if (cnpj && rel.cnpj && limparCnpj(cnpj) !== rel.cnpj) {
        setMsgRelatorio(`Atenção: o relatório é do CNPJ ${formatarCnpj(rel.cnpj)}, diferente do consultado. Nada foi importado.`);
        return;
      }
      setDebitos((d) => [...d.filter((x) => x.origem !== "upload"), ...j.debitos]);
      setMsgRelatorio(`${j.debitos.length} pendência(s) importadas do relatório emitido em ${rel.emitidoEm ?? "data não informada"}.`);
    } catch (e) {
      setMsgRelatorio((e as Error).message);
    }
  }

  async function buscarCadastro() {
    setErro("");
    setCadastro(null);
    if (!cnpjValido(cnpj)) {
      setErro("CNPJ inválido. Confira os dígitos.");
      return;
    }
    setCarregando(true);
    try {
      const r = await fetch(`/api/cnpj/${limparCnpj(cnpj)}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.erro);
      setCadastro(j);
      if (integraAtivo) {
        buscarSituacaoFiscal(limparCnpj(cnpj));
        if (j.optanteMei) buscarDividaMunicipalMei(limparCnpj(cnpj));
      }
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setCarregando(false);
    }
  }

  async function buscarSituacaoFiscal(cnpjAlvo = cnpj) {
    setMsgIntegra("Buscando o relatório de situação fiscal na Receita. Pode levar até 1 minuto...");
    setPdfReceita(null);
    try {
      const r = await fetch("/api/situacao-fiscal", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cnpj: cnpjAlvo }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.erro);
      const rel: RelatorioSituacaoFiscal = j.relatorio;
      setRelatorio(rel);
      const encontrados: Debito[] = j.debitos.map((d: Debito) => ({ ...d, origem: "integra" }));
      setDebitos((d) => [...d.filter((x) => (x.origem !== "integra" && x.origem !== "upload") || x.orgao === "PREFEITURA" || x.orgao === "ESTADO"), ...encontrados]);
      setPdfReceita(j.pdfBase64);
      setMsgIntegra(`${encontrados.length} pendência(s) trazidas da Receita (relatório emitido em ${rel.emitidoEm ?? "agora"}).`);
    } catch (e) {
      setMsgIntegra((e as Error).message);
    }
  }

  /** ISS e ICMS do DAS-MEI inscritos em dívida ativa da prefeitura ou do estado (PGMEI). Os da União já vêm no relatório. */
  async function buscarDividaMunicipalMei(cnpjAlvo: string) {
    setMsgMunicipal("Buscando ISS/ICMS do MEI em dívida ativa da prefeitura e do estado...");
    try {
      const r = await fetch("/api/debitos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cnpj: cnpjAlvo }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.erro);
      const locais: Debito[] = (j.debitos as Debito[]).filter((d) => d.orgao === "PREFEITURA" || d.orgao === "ESTADO");
      setDebitos((d) => [...d.filter((x) => !(x.origem === "integra" && (x.orgao === "PREFEITURA" || x.orgao === "ESTADO"))), ...locais]);
      setMsgMunicipal(locais.length ? `${locais.length} débito(s) do DAS-MEI em dívida ativa da prefeitura ou do estado.` : "Nenhum ISS/ICMS do MEI em dívida ativa da prefeitura ou do estado.");
    } catch (e) {
      setMsgMunicipal(`Prefeitura/estado (PGMEI): ${(e as Error).message}`);
    }
  }

  function adicionarDebito() {
    const original = num(novo.original), multa = num(novo.multa), juros = num(novo.juros);
    const valor = Math.round((original + multa + juros) * 100) / 100;
    if (!/_OMISSA$/.test(novo.tipo) && valor <= 0) return;
    setDebitos((d) => [
      ...d,
      {
        tipo: novo.tipo,
        orgao: novo.orgao,
        descricao: novo.descricao.trim() || TIPOS[novo.tipo],
        competencia: novo.competencia || undefined,
        vencimento: novo.vencimento || undefined,
        valorOriginal: original,
        multa,
        juros,
        valor,
        origem: "manual",
      },
    ]);
    setNovo({ ...vazio, orgao: novo.orgao, tipo: novo.tipo });
  }

  const grupos = useMemo(() => agruparPorOrgao(debitos), [debitos]);
  const totalEmAberto = Math.round(grupos.reduce((t, g) => t + g.total, 0) * 100) / 100;

  return (
    <main>
      <header className="topo">
        <h1>Análise de cliente · débitos, situação fiscal e Simples Nacional</h1>
        <span className="marca">NEVES CONT</span>
      </header>

      <section className="card nao-imprimir">
        <h2>1. CNPJ do cliente</h2>
        <div className="linha">
          <label style={{ flex: "1 1 220px" }}>
            CNPJ
            <input value={cnpj} onChange={(e) => setCnpj(e.target.value)} placeholder="00.000.000/0000-00" onKeyDown={(e) => e.key === "Enter" && buscarCadastro()} />
          </label>
          <button onClick={buscarCadastro} disabled={carregando}>{carregando ? "Consultando..." : "Consultar"}</button>
        </div>
        {erro && <p className="erro">{erro}</p>}
      </section>

      {cadastro && (
        <section className="card">
          <h2>
            {cadastro.razaoSocial} <span className={`tag ${cadastro.situacao === "ATIVA" ? "" : "ruim"}`}>{cadastro.situacao}</span>
          </h2>
          <div className="grade">
            <div><span>CNPJ</span>{formatarCnpj(cadastro.cnpj)}</div>
            <div><span>Abertura</span>{cadastro.abertura ?? "-"}</div>
            <div><span>Optante MEI / Simples</span>{cadastro.optanteMei ? "Sim" : "Não"} / {cadastro.optanteSimples ? "Sim" : "Não"}</div>
            <div><span>Município</span>{cadastro.municipio}/{cadastro.uf}</div>
            {cadastro.motivoSituacao && <div><span>Motivo da situação</span>{cadastro.motivoSituacao}</div>}
            <div style={{ gridColumn: "1 / -1" }}><span>Atividade principal</span>{cadastro.cnaePrincipal.codigo} · {cadastro.cnaePrincipal.descricao}</div>
          </div>
          <p className="nota">Fonte: {cadastro.fonte}, consultado em {new Date(cadastro.consultadoEm).toLocaleString("pt-BR")}.</p>
        </section>
      )}

      <section className="card">
        <h2>2. Débitos em aberto</h2>
        <div className="linha nao-imprimir" style={{ marginBottom: 12 }}>
          <button className="sec" onClick={() => buscarSituacaoFiscal()} disabled={!cnpjValido(cnpj) || !integraAtivo} title={integraAtivo ? "" : "Integra Contador não configurado no servidor"}>
            Buscar no e-CAC e PGFN
          </button>
          <label className="sec-arquivo">
            <span className="botao-sec">Ler relatório de situação fiscal (PDF)</span>
            <input type="file" accept="application/pdf" onChange={(e) => { lerRelatorio(e.target.files?.[0]); e.target.value = ""; }} hidden />
          </label>
        </div>
        {!integraAtivo && <p className="nota nao-imprimir">Busca automática na Receita desligada: cadastre as credenciais do Integra Contador no servidor. Enquanto isso, use o PDF.</p>}
        {msgIntegra && <p className="nota nao-imprimir">{msgIntegra}</p>}
        {msgMunicipal && <p className="nota nao-imprimir">{msgMunicipal}</p>}
        {pdfReceita && (
          <p className="nota nao-imprimir">
            <a href={`data:application/pdf;base64,${pdfReceita}`} download={`situacao-fiscal-${limparCnpj(cnpj)}.pdf`}>Baixar o relatório da Receita (PDF)</a>
          </p>
        )}
        {msgRelatorio && <p className="nota nao-imprimir">{msgRelatorio}</p>}
        {relatorio && (
          <div className="grade" style={{ marginBottom: 12 }}>
            <div><span>Relatório de situação fiscal</span>{relatorio.razaoSocial ?? "-"}</div>
            <div><span>Emitido em</span>{relatorio.emitidoEm ?? "-"}</div>
            <div><span>Situação no relatório</span>{relatorio.situacao ?? "-"}</div>
            {relatorio.certidao && <div><span>Última certidão</span>{relatorio.certidao.tipo}, validade {relatorio.certidao.validade}</div>}
            {relatorio.avisos.length > 0 && <div className="alerta" style={{ gridColumn: "1 / -1" }}>{relatorio.avisos.slice(0, 5).join(" ")}</div>}
          </div>
        )}

        <div className="divida-total">
          <div><span>Total em aberto</span><strong>{brl(totalEmAberto)}</strong></div>
          {grupos.map((g) => (
            <div key={g.orgao}><span>{g.nome}</span><strong>{brl(g.total)}</strong></div>
          ))}
          <div className="nota">
            {debitos.length === 0
              ? "Nenhum débito encontrado ou lançado até agora."
              : `${debitos.length} débito(s). Valores atualizados até a data do relatório, com multa e juros.`}
          </div>
        </div>

        {grupos.map((g) => (
          <div key={g.orgao} style={{ marginBottom: 16 }}>
            <h3 className="orgao">{g.nome} <span className="nota">· {g.onde}</span></h3>
            <div className="tabela-rolagem">
              <table>
                <thead>
                  <tr>
                    <th>Tributo / débito</th><th>Competência</th><th>Vencimento</th>
                    <th className="num">Valor original</th><th className="num">Multa</th><th className="num">Juros</th><th className="num">Total</th>
                    <th>Situação</th><th className="nao-imprimir" />
                  </tr>
                </thead>
                <tbody>
                  {g.itens.map(({ debito: d, indice }) => (
                    <tr key={indice}>
                      <td>{d.descricao || TIPOS[d.tipo]}<div className="nota">{RESOLVE[d.tipo]}{d.origem === "manual" ? " · lançado à mão" : d.origem === "upload" ? " · PDF enviado" : ""}</div></td>
                      <td>{d.competencia ?? "-"}</td>
                      <td>{d.vencimento ?? "-"}</td>
                      <td className="num">{d.valorOriginal !== undefined ? brl(d.valorOriginal) : "-"}</td>
                      <td className="num">{d.multa !== undefined ? brl(d.multa) : "-"}</td>
                      <td className="num">{d.juros !== undefined ? brl(d.juros) : "-"}</td>
                      <td className="num"><strong>{valorDebito(d) > 0 ? brl(valorDebito(d)) : <span className="nota">sem valor</span>}</strong></td>
                      <td className="nota">{d.situacao ?? "-"}</td>
                      <td className="nao-imprimir"><button className="mini" onClick={() => setDebitos(debitos.filter((_, j) => j !== indice))}>remover</button></td>
                    </tr>
                  ))}
                  <tr className="subtotal">
                    <td colSpan={3}>Subtotal {g.nome}</td>
                    <td className="num">{brl(g.valorOriginal)}</td>
                    <td className="num">{brl(g.multa)}</td>
                    <td className="num">{brl(g.juros)}</td>
                    <td className="num">{brl(g.total)}</td>
                    <td colSpan={2} className="nota">{g.semDetalhe > 0 ? `${g.semDetalhe} item(ns) só com o total` : ""}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        ))}

        <details className="nao-imprimir">
          <summary>Lançar débito à mão (prefeitura, estado ou outro)</summary>
          <p className="nota">
            Prefeituras não têm consulta nacional: cada município tem o seu portal. Confira a certidão ou o extrato de débitos da prefeitura do cliente e lance aqui.
          </p>
          <div className="grade">
            <label>
              Órgão
              <select value={novo.orgao} onChange={(e) => setNovo({ ...novo, orgao: e.target.value as Orgao })}>
                {ORGAOS.map((o) => <option key={o.codigo} value={o.codigo}>{o.nome}</option>)}
              </select>
            </label>
            <label>
              Tipo
              <select value={novo.tipo} onChange={(e) => setNovo({ ...novo, tipo: e.target.value as TipoDebito })}>
                {Object.entries(TIPOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
            <label>Descrição<input value={novo.descricao} onChange={(e) => setNovo({ ...novo, descricao: e.target.value })} placeholder="ISS 2024, IPTU, taxa de licença..." /></label>
            <label>Competência<input value={novo.competencia} onChange={(e) => setNovo({ ...novo, competencia: e.target.value })} placeholder="03/2024" /></label>
            <label>Vencimento<input value={novo.vencimento} onChange={(e) => setNovo({ ...novo, vencimento: e.target.value })} placeholder="20/04/2024" /></label>
            <label>Valor original (R$)<input value={novo.original} onChange={(e) => setNovo({ ...novo, original: e.target.value })} inputMode="decimal" /></label>
            <label>Multa (R$)<input value={novo.multa} onChange={(e) => setNovo({ ...novo, multa: e.target.value })} inputMode="decimal" /></label>
            <label>Juros (R$)<input value={novo.juros} onChange={(e) => setNovo({ ...novo, juros: e.target.value })} inputMode="decimal" /></label>
          </div>
          <div className="linha" style={{ marginTop: 8 }}>
            <button onClick={adicionarDebito}>Adicionar débito</button>
            <span className="nota">Total = original + multa + juros{/_OMISSA$/.test(novo.tipo) ? `. Declaração sem valor usa a multa mínima de ${brl(valorDebito({ tipo: novo.tipo, descricao: "", valor: 0, origem: "manual" }))}` : ""}.</span>
          </div>
        </details>
        <div className="linha nao-imprimir" style={{ marginTop: 12 }}><button onClick={() => window.print()}>Imprimir ou salvar PDF</button></div>
        <p className="so-impressao nota">Relatório gerado em {new Date().toLocaleDateString("pt-BR")} · NEVES CONT</p>
      </section>

      {cadastro && !cadastro.optanteMei && !cadastro.optanteSimples && !verSimples && (
        <section className="card nao-imprimir">
          <p className="nota">A empresa não aparece como optante pelo Simples no cadastro público.</p>
          <button className="sec" onClick={() => setVerSimples(true)}>Analisar como Simples Nacional mesmo assim</button>
        </section>
      )}
      {cadastro && !cadastro.optanteMei && (cadastro.optanteSimples || verSimples) && (
        <AnaliseSimples cnpj={limparCnpj(cnpj)} cadastro={cadastro} relatorio={relatorio} debitos={debitos} setDebitos={setDebitos} integraAtivo={integraAtivo} />
      )}
    </main>
  );
}
