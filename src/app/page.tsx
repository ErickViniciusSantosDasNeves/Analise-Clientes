"use client";

import { useMemo, useState } from "react";
import { cnpjValido, formatarCnpj, limparCnpj } from "@/lib/cnpj";
import type { Cadastro } from "@/lib/fontes/brasilapi";
import { analisarMei } from "@/lib/motor/mei";
import { analisarReforma } from "@/lib/motor/reforma";
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
  const [vendasEmpresas, setVendasEmpresas] = useState("0");
  const honAbertura = "800";

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
  const reforma = useMemo(() => analisarReforma(new Date().toISOString().slice(0, 10), Math.min(100, num(vendasEmpresas)) / 100), [vendasEmpresas]);
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
          <label>Vendas para outras empresas (% do faturamento)<input value={vendasEmpresas} onChange={(e) => setVendasEmpresas(e.target.value)} inputMode="decimal" /></label>
          <label>Honorário de baixa (R$)<input value={honBaixa} onChange={(e) => setHonBaixa(e.target.value)} inputMode="decimal" /></label>
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
        <div className="divida-total">
          <div><span>Dívida total do cliente</span><strong>{brl(resultado.totalDebitos)}</strong></div>
          {resultado.totalDebitos > 0 && (() => {
            const parc = resultado.cenarios[0].parcelaRegularizacao;
            return parc && parc.parcelas > 1 ? <div><span>Se parcelar (PARCMEI)</span><strong>{parc.parcelas}x de {brl(parc.valor)}</strong></div> : null;
          })()}
          <div className="nota">Soma de todas as pendências do mapa, atualizadas até a data do relatório, sem limite de prazo.</div>
        </div>
        <p>{resultado.justificativa}</p>
        <div className="cenarios">
          {resultado.cenarios.map((c) => <CartaoCenario key={c.codigo} c={c} melhor={c.codigo === resultado.recomendado} />)}
        </div>
        <p className="nota">
          Custo em 12 meses = impostos, encargos e honorários do próximo ano. A dívida aparece à parte, pelo valor total. Estimativa de apoio à decisão; valores legais em revisão pelo contador.
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
      <section className="card">
        <h2>5. Reforma Tributária: IBS e CBS</h2>
        <p className="nota">
          Transição da EC 132/2023 e da LC 214/2025. Alíquotas cheias são estimativas do governo ({(reforma.aliquotaPlenaEstimada * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% somando CBS e IBS) até a fixação pelo Senado.
        </p>
        <div className="tabela-rolagem">
          <table>
            <thead>
              <tr><th>Ano</th><th className="num">CBS</th><th className="num">IBS</th><th>PIS/Cofins</th><th className="num">ICMS e ISS</th><th>O que acontece</th></tr>
            </thead>
            <tbody>
              {reforma.cronograma.map((a) => (
                <tr key={a.ano}>
                  <td>{a.ano}</td>
                  <td className="num">{(a.cbs * 100).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%</td>
                  <td className="num">{(a.ibs * 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%</td>
                  <td>{a.pisCofinsExiste ? "Continua" : "Extinto"}</td>
                  <td className="num">{a.icmsIssRestante === 0 ? "Extintos" : `${Math.round(a.icmsIssRestante * 100)}%`}</td>
                  <td className="nota">{a.apenasTeste ? "Ano de teste: valores compensáveis; Simples e MEI não recolhem." : a.fonte.replace(/^LC 214\/2025: /, "")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="cenarios" style={{ marginTop: 12 }}>
          {resultado.cenarios.map((c) => (
            <div key={c.codigo} className="cenario">
              <h3>{c.codigo}. {c.titulo}</h3>
              <ul>{reforma.porCaminho[c.codigo].map((t) => <li key={t}>{t}</li>)}</ul>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}

const SIGNIFICADO: Record<Cenario["codigo"], string> = {
  A: "Regulariza a dívida, entrega as declarações e o cliente segue como MEI.",
  B: "Regulariza a dívida e encerra o CNPJ. Para quem vai parar de trabalhar.",
  C: "Regulariza a dívida e o mesmo CNPJ deixa de ser MEI e passa a ME no Simples Nacional.",
};

function CartaoCenario({ c, melhor }: { c: Cenario; melhor: boolean }) {
  const mensal = c.custoMensal.reduce((s, l) => s + l.valor, 0);
  return (
    <div className={`cenario ${melhor ? "melhor" : ""} ${c.viavel ? "" : "inviavel"}`}>
      <h3>{c.codigo}. {c.titulo}</h3>
      {melhor && <span className="tag">Menor custo para continuar</span>}
      {!c.viavel && <span className="tag ruim">Não viável</span>}
      <p className="nota" style={{ margin: "6px 0" }}>{SIGNIFICADO[c.codigo]}</p>
      <table className="composicao">
        <tbody>
          <tr className="grupo"><td colSpan={2}>Custo em 12 meses</td></tr>
          {c.custoUnico.map((l) => (
            <tr key={l.item}><td>{l.item}</td><td className="num">{brl(l.valor)}</td></tr>
          ))}
          {c.custoMensal.map((l) => (
            <tr key={l.item}>
              <td>{l.item}<div className="nota">{brl(l.valor)} por mês × 12</div></td>
              <td className="num">{brl(l.valor * 12)}</td>
            </tr>
          ))}
          <tr className="subtotal"><td>Subtotal 12 meses</td><td className="num">{brl(c.custo12m)}</td></tr>
          {c.regularizacao > 0 && (
            <tr>
              <td>
                Dívida total a regularizar
                {c.parcelaRegularizacao && c.parcelaRegularizacao.parcelas > 1 && (
                  <div className="nota">à vista, ou {c.parcelaRegularizacao.parcelas}x de {brl(c.parcelaRegularizacao.valor)}</div>
                )}
              </td>
              <td className="num">{brl(c.regularizacao)}</td>
            </tr>
          )}
          <tr className="total-linha"><td>Total (12 meses + dívida)</td><td className="num">{brl(c.desembolso12m)}</td></tr>
        </tbody>
      </table>
      <div className="nota">
        {mensal > 0 ? `Custo mensal: ${brl(mensal)}` : "Sem custo mensal depois da baixa"}
        {c.regime ? ` · ${c.regime}` : ""}
      </div>
      {c.alertas.map((a) => <div key={a} className="alerta">{a}</div>)}
    </div>
  );
}
