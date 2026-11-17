"use client";

import { useMemo, useState } from "react";
import { cnpjValido, formatarCnpj, limparCnpj } from "@/lib/cnpj";
import type { Cadastro } from "@/lib/fontes/brasilapi";
import { analisarMei } from "@/lib/motor/mei";
import { MEI_REGRAS as MEI } from "@/lib/motor/parametros";
import type { RelatorioSituacaoFiscal } from "@/lib/relatorio/situacao-fiscal";
import type { Atividade, Cenario, Debito, EntradaMei, TipoDebito } from "@/lib/motor/tipos";

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const num = (s: string) => Number(s.replace(/\./g, "").replace(",", ".")) || 0;

const TIPOS: Record<TipoDebito, string> = {
  DAS: "DAS em aberto",
  DIVIDA_ATIVA: "Dívida ativa (PGFN)",
  DASN_OMISSA: "DASN-SIMEI não entregue",
  PARCELAMENTO: "Saldo de parcelamento",
  OUTRO: "Outro",
};

const RESOLVE: Record<TipoDebito, string> = {
  DAS: "Pagar ou parcelar (PARCMEI)",
  DIVIDA_ATIVA: "Pagar, parcelar ou transação no Regularize",
  DASN_OMISSA: "Entregar a declaração e pagar a multa",
  PARCELAMENTO: "Manter em dia ou quitar",
  OUTRO: "Analisar",
};

export default function Pagina() {
  const [cnpj, setCnpj] = useState("");
  const [cadastro, setCadastro] = useState<Cadastro | null>(null);
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);

  const [faturamento, setFaturamento] = useState("60000");
  const [atividade, setAtividade] = useState<Atividade>("servico");
  const [permitida, setPermitida] = useState(true);
  const [salarioEmpregado, setSalarioEmpregado] = useState("0");
  const [proLabore, setProLabore] = useState("1621");
  const [honMei, setHonMei] = useState("150");
  const [honMe, setHonMe] = useState("450");
  const [honBaixa, setHonBaixa] = useState("300");
  const [honAbertura, setHonAbertura] = useState("800");

  const [debitos, setDebitos] = useState<Debito[]>([]);
  const [novo, setNovo] = useState<{ tipo: TipoDebito; competencia: string; valor: string }>({ tipo: "DAS", competencia: "", valor: "" });
  const [msgIntegra, setMsgIntegra] = useState("");
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
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setCarregando(false);
    }
  }

  async function buscarIntegra() {
    setMsgIntegra("Consultando o Integra Contador...");
    try {
      const r = await fetch("/api/debitos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cnpj }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.erro);
      const encontrados: Debito[] = j.debitos;
      setDebitos((d) => [...d.filter((x) => x.origem !== "integra"), ...encontrados]);
      setMsgIntegra(`${encontrados.length} débito(s) trazidos do Integra Contador. Confira com o relatório de situação fiscal.`);
    } catch (e) {
      setMsgIntegra((e as Error).message);
    }
  }

  function adicionarDebito() {
    const valor = num(novo.valor);
    if (novo.tipo !== "DASN_OMISSA" && valor <= 0) return;
    setDebitos((d) => [...d, { tipo: novo.tipo, descricao: TIPOS[novo.tipo], competencia: novo.competencia || undefined, valor, origem: "manual" }]);
    setNovo({ ...novo, competencia: "", valor: "" });
  }

  const entrada: EntradaMei = {
    situacao: cadastro?.situacao ?? relatorio?.situacao ?? "ATIVA",
    faturamento12m: num(faturamento),
    atividade,
    atividadePermitidaMei: permitida,
    salarioEmpregado: num(salarioEmpregado),
    debitos,
    proLaboreMensal: num(proLabore),
    honorarios: { meiMensal: num(honMei), meMensal: num(honMe), baixa: num(honBaixa), abertura: num(honAbertura) },
  };
  const resultado = useMemo(() => analisarMei(entrada), [JSON.stringify(entrada)]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <main>
      <header className="topo">
        <h1>Análise de cliente · MEI</h1>
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

      <section className="card nao-imprimir">
        <h2>2. Dados para a simulação</h2>
        <div className="grade">
          <label>Faturamento previsto em 12 meses (R$)<input value={faturamento} onChange={(e) => setFaturamento(e.target.value)} inputMode="decimal" /></label>
          <label>
            Atividade
            <select value={atividade} onChange={(e) => setAtividade(e.target.value as Atividade)}>
              <option value="servico">Serviço</option>
              <option value="comercio">Comércio</option>
              <option value="industria">Indústria</option>
            </select>
          </label>
          <label>Salário do empregado (R$/mês, 0 se não tem)<input value={salarioEmpregado} onChange={(e) => setSalarioEmpregado(e.target.value)} inputMode="decimal" /></label>
          <label>Pró-labore se virar ME (R$/mês)<input value={proLabore} onChange={(e) => setProLabore(e.target.value)} inputMode="decimal" /></label>
          <label>Honorário MEI (R$/mês)<input value={honMei} onChange={(e) => setHonMei(e.target.value)} inputMode="decimal" /></label>
          <label>Honorário ME (R$/mês)<input value={honMe} onChange={(e) => setHonMe(e.target.value)} inputMode="decimal" /></label>
          <label>Honorário de baixa (R$)<input value={honBaixa} onChange={(e) => setHonBaixa(e.target.value)} inputMode="decimal" /></label>
          <label>Honorário de abertura (R$)<input value={honAbertura} onChange={(e) => setHonAbertura(e.target.value)} inputMode="decimal" /></label>
          <label style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <input type="checkbox" checked={permitida} onChange={(e) => setPermitida(e.target.checked)} /> Atividades permitidas ao MEI
          </label>
        </div>
        <p className="nota">Limite do MEI usado: {brl(resultado.parametros.limiteMei)} por ano.</p>
      </section>

      <section className="card">
        <h2>3. Mapa de pendências · total {brl(resultado.totalDebitos)}</h2>
        <div className="linha nao-imprimir" style={{ marginBottom: 12 }}>
          <button className="sec" onClick={buscarIntegra} disabled={!cnpjValido(cnpj)}>Buscar no Integra Contador</button>
          <label className="sec-arquivo">
            <span className="botao-sec">Ler relatório de situação fiscal (PDF)</span>
            <input type="file" accept="application/pdf" onChange={(e) => { lerRelatorio(e.target.files?.[0]); e.target.value = ""; }} hidden />
          </label>
        </div>
        {msgIntegra && <p className="nota nao-imprimir">{msgIntegra}</p>}
        {msgRelatorio && <p className="nota nao-imprimir">{msgRelatorio}</p>}
        {relatorio && (
          <div className="grade" style={{ marginBottom: 12 }}>
            <div><span>Relatório de situação fiscal</span>{relatorio.razaoSocial ?? "-"}</div>
            <div><span>Situação no relatório</span>{relatorio.situacao ?? "-"}</div>
            <div><span>Porte</span>{relatorio.porte ?? "-"}</div>
            <div><span>Simples Nacional</span>{relatorio.periodosSimples.map((p) => `${p.inclusao} a ${p.exclusao ?? "atual"}`).join("; ") || "-"}</div>
            {relatorio.certidao && <div><span>Última certidão</span>{relatorio.certidao.tipo}, validade {relatorio.certidao.validade}</div>}
            {relatorio.avisos.length > 0 && <div className="alerta" style={{ gridColumn: "1 / -1" }}>{relatorio.avisos.slice(0, 5).join(" ")}</div>}
          </div>
        )}
        <div className="tabela-rolagem">
          <table>
            <thead>
              <tr><th>Pendência</th><th>Competência</th><th>Situação</th><th>Como resolve</th><th>Origem</th><th className="num">Valor atualizado</th><th className="nao-imprimir" /></tr>
            </thead>
            <tbody>
              {debitos.length === 0 && (
                <tr><td colSpan={7} className="nota">Nenhuma pendência lançada.</td></tr>
              )}
              {debitos.map((d, i) => (
                <tr key={i}>
                  <td>{TIPOS[d.tipo]}{d.origem !== "manual" && d.descricao ? <div className="nota">{d.descricao}</div> : null}</td>
                  <td>{d.competencia ?? "-"}</td>
                  <td className="nota">{d.situacao ?? "-"}</td>
                  <td>{RESOLVE[d.tipo]}</td>
                  <td>{d.origem === "integra" ? "Integra Contador" : d.origem === "upload" ? "Relatório" : "Manual"}</td>
                  <td className="num">{d.tipo === "DASN_OMISSA" && d.valor <= 0 ? brl(MEI.multaMinimaDasn) : d.valor > 0 ? brl(d.valor) : <span className="nota">sem valor no relatório</span>}</td>
                  <td className="nao-imprimir"><button className="mini" onClick={() => setDebitos(debitos.filter((_, j) => j !== i))}>remover</button></td>
                </tr>
              ))}
              <tr className="nao-imprimir">
                <td>
                  <select value={novo.tipo} onChange={(e) => setNovo({ ...novo, tipo: e.target.value as TipoDebito })}>
                    {Object.entries(TIPOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </td>
                <td><input value={novo.competencia} onChange={(e) => setNovo({ ...novo, competencia: e.target.value })} placeholder="2024-03" size={8} /></td>
                <td colSpan={3} className="nota">{novo.tipo === "DASN_OMISSA" ? `Sem valor, usa multa mínima de ${brl(MEI.multaMinimaDasn)}` : ""}</td>
                <td className="num"><input value={novo.valor} onChange={(e) => setNovo({ ...novo, valor: e.target.value })} placeholder="0,00" size={9} inputMode="decimal" /></td>
                <td><button onClick={adicionarDebito}>Adicionar</button></td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <h2>4. Caminhos possíveis</h2>
        <p>{resultado.justificativa}</p>
        <div className="cenarios">
          {resultado.cenarios.map((c) => <CartaoCenario key={c.codigo} c={c} melhor={c.codigo === resultado.recomendado} />)}
        </div>
        <p className="nota">
          Desembolso em 12 meses = regularização exigida no caminho + custos únicos + 12 meses de custo mensal. Estimativa de apoio à decisão; valores legais em revisão pelo contador.
        </p>
        <details className="nota" style={{ marginBottom: 12 }}>
          <summary>Valores legais usados (vigentes em {resultado.parametros.data.split("-").reverse().join("/")})</summary>
          <ul>
            {resultado.parametros.fontes.map((f) => (
              <li key={f.item}>{f.item}: {f.fonte}, desde {f.vigenteDesde.split("-").reverse().join("/")}</li>
            ))}
          </ul>
        </details>
        <div className="linha nao-imprimir"><button onClick={() => window.print()}>Imprimir ou salvar PDF</button></div>
        <p className="so-impressao nota">Relatório gerado em {new Date().toLocaleDateString("pt-BR")} · NEVES CONT</p>
      </section>
    </main>
  );
}

function CartaoCenario({ c, melhor }: { c: Cenario; melhor: boolean }) {
  return (
    <div className={`cenario ${melhor ? "melhor" : ""} ${c.viavel ? "" : "inviavel"}`}>
      <h3>{c.codigo}. {c.titulo}</h3>
      {melhor && <span className="tag">Menor desembolso</span>}
      {!c.viavel && <span className="tag ruim">Não viável</span>}
      <div className="total">{brl(c.desembolso12m)}</div>
      <div className="nota">desembolso em 12 meses{c.regime ? ` · ${c.regime}` : ""}</div>
      <ul>
        {c.regularizacao > 0 && (
          <li>
            Regularização: {brl(c.regularizacao)}
            {c.parcelaRegularizacao && c.parcelaRegularizacao.parcelas > 1 && ` (ou ${c.parcelaRegularizacao.parcelas}x de ${brl(c.parcelaRegularizacao.valor)})`}
          </li>
        )}
        {c.custoUnico.map((l) => <li key={l.item}>{l.item}: {brl(l.valor)}</li>)}
        {c.custoMensal.map((l) => <li key={l.item}>{l.item}: {brl(l.valor)}/mês</li>)}
        {c.debitoRemanescente > 0 && <li>Débito que continua no CPF: {brl(c.debitoRemanescente)}</li>}
      </ul>
      {c.alertas.map((a) => <div key={a} className="alerta">{a}</div>)}
    </div>
  );
}
