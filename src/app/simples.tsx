"use client";

import { useEffect, useMemo, useState } from "react";
import type { Cadastro } from "@/lib/fontes/brasilapi";
import type { ObrigacoesSimples } from "@/lib/fontes/simples-integra";
import { sugerirEnquadramento } from "@/lib/motor/cnae-anexo";
import { analisarSimples, type CenarioSimples, type Enquadramento, type EntradaSimples } from "@/lib/motor/simples";
import type { Debito } from "@/lib/motor/tipos";
import type { RelatorioSituacaoFiscal } from "@/lib/relatorio/situacao-fiscal";

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const num = (s: string) => Number(s.replace(/\./g, "").replace(",", ".")) || 0;
const fr = (s: string) => Math.min(100, Math.max(0, num(s))) / 100;
const pct = (v: number, casas = 2) => `${(v * 100).toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas })}%`;
const mesAno = (aaaamm: string) => `${aaaamm.slice(4)}/${aaaamm.slice(0, 4)}`;

const ENQUADRAMENTOS: { v: Enquadramento; t: string }[] = [
  { v: "I", t: "Anexo I · Comércio" },
  { v: "II", t: "Anexo II · Indústria" },
  { v: "III", t: "Anexo III · Serviços" },
  { v: "FATOR_R", t: "Anexo III ou V · fator R" },
  { v: "IV", t: "Anexo IV · CPP fora do DAS" },
  { v: "V", t: "Anexo V · Serviços" },
];

interface LinhaAtividade {
  descricao: string;
  enquadramento: Enquadramento;
  receita: string;
  st: string;
  mono: string;
  ret: string;
  exp: string;
}

interface Props {
  cnpj: string;
  cadastro: Cadastro | null;
  relatorio: RelatorioSituacaoFiscal | null;
  debitos: Debito[];
  setDebitos: (f: (d: Debito[]) => Debito[]) => void;
  integraAtivo: boolean;
}

function CartaoCenario({ c, melhor }: { c: CenarioSimples; melhor: boolean }) {
  const mensal = c.custoMensal.reduce((s, l) => s + l.valor, 0);
  return (
    <div className={`cenario ${melhor ? "melhor" : ""} ${c.viavel ? "" : "inviavel"}`}>
      <h3>{c.codigo}. {c.titulo}</h3>
      {c.regime && <div className="nota">{c.regime}</div>}
      {!c.viavel && <span className="tag ruim">Inviável</span>}
      {melhor && <span className="tag">Menor custo</span>}
      <div className="total">{brl(c.custo12m)}</div>
      <div className="nota">{c.continuaOperando ? `custo em 12 meses · ${brl(mensal)}/mês` : "custo do encerramento"}</div>
      <table className="composicao">
        <tbody>
          {[...c.custoMensal, ...c.custoUnico].map((l) => (
            <tr key={l.item}><td>{l.item}</td><td className="num">{brl(l.valor)}</td></tr>
          ))}
        </tbody>
      </table>
      {c.alertas.length > 0 && <ul>{c.alertas.map((a) => <li key={a}>{a}</li>)}</ul>}
    </div>
  );
}

export default function AnaliseSimples({ cnpj, cadastro, relatorio, debitos, setDebitos, integraAtivo }: Props) {
  const [rbt12, setRbt12] = useState("");
  const [meses, setMeses] = useState("12");
  const [atividades, setAtividades] = useState<LinhaAtividade[]>([{ descricao: "Atividade principal", enquadramento: "III", receita: "30000", st: "0", mono: "0", ret: "0", exp: "0" }]);
  const [salarios, setSalarios] = useState("0");
  const [proLabore, setProLabore] = useState("1621");
  const [socios, setSocios] = useState("1");
  const [rat, setRat] = useState("2");
  const [provisoes, setProvisoes] = useState(true);
  const [iss, setIss] = useState("5");
  const [icms, setIcms] = useState("5");
  const [compras, setCompras] = useState("30");
  const [vendasPj, setVendasPj] = useState("50");
  const [honSimples, setHonSimples] = useState("800");
  const [honPresumido, setHonPresumido] = useState("1500");
  const [honBaixa, setHonBaixa] = useState("1000");
  const [vedada, setVedada] = useState(false);
  const [sugestao, setSugestao] = useState("");
  const [obrig, setObrig] = useState<ObrigacoesSimples | null>(null);
  const [msgObrig, setMsgObrig] = useState("");

  // Sugere o anexo pelo CNAE principal quando o cadastro chega.
  useEffect(() => {
    if (!cadastro) return;
    const s = sugerirEnquadramento(cadastro.cnaePrincipal.codigo);
    setAtividades((a) => [{ ...a[0], descricao: cadastro.cnaePrincipal.descricao || a[0].descricao, enquadramento: s.enquadramento }, ...a.slice(1)]);
    setSugestao(`${cadastro.cnaePrincipal.codigo}: ${s.motivo}. Confira as atividades exercidas e ajuste.`);
  }, [cadastro]);

  const inicioSimples = relatorio?.periodosSimples.filter((p) => !p.exclusao).at(-1)?.inclusao ?? cadastro?.abertura;

  async function buscarObrigacoes() {
    setMsgObrig("Consultando PGDAS-D, DEFIS e parcelamentos na Receita...");
    try {
      const r = await fetch("/api/simples", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cnpj, inicio: inicioSimples }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.erro);
      setObrig(j);
      const novos: Debito[] = j.debitos;
      setDebitos((d) => [...d.filter((x) => !(x.origem === "integra" && (x.tipo === "PGDAS_OMISSA" || x.tipo === "DEFIS_OMISSA"))), ...novos]);
      setMsgObrig(`${j.pgdasOmissos.length} PGDAS-D e ${j.defisOmissas.length} DEFIS em atraso incluídos no mapa de débitos.${j.avisos.length ? " Avisos: " + j.avisos.join(" · ") : ""}`);
    } catch (e) {
      setMsgObrig((e as Error).message);
    }
  }

  const entrada: EntradaSimples = {
    situacao: cadastro?.situacao ?? relatorio?.situacao ?? "ATIVA",
    rbt12: num(rbt12) || undefined,
    mesesAtividade: num(meses) || 12,
    atividades: atividades.map((a) => ({ descricao: a.descricao || "Atividade", enquadramento: a.enquadramento, receitaMensal: num(a.receita), icmsSt: fr(a.st), monofasico: fr(a.mono), issRetido: fr(a.ret), exportacao: fr(a.exp) })),
    folha: { salariosMensais: num(salarios), proLaboreMensal: num(proLabore), socios: Math.max(1, num(socios)), rat: fr(rat), incluirProvisoes: provisoes },
    atividadeVedada: vedada,
    issMunicipal: fr(iss),
    icmsEfetivoNormal: fr(icms),
    comprasComCredito: fr(compras),
    vendasParaEmpresas: fr(vendasPj),
    debitos,
    honorarios: { simplesMensal: num(honSimples), presumidoMensal: num(honPresumido), baixa: num(honBaixa) },
  };
  const r = useMemo(() => analisarSimples(entrada), [JSON.stringify(entrada)]); // eslint-disable-line react-hooks/exhaustive-deps
  const ap = r.apuracao;
  const tributos = Object.entries(ap.porTributo).filter(([, v]) => (v ?? 0) > 0);
  const temComercio = atividades.some((a) => a.enquadramento === "I" || a.enquadramento === "II");

  const mudar = (i: number, campo: keyof LinhaAtividade, v: string) => setAtividades((l) => l.map((a, j) => (j === i ? { ...a, [campo]: v } : a)));

  return (
    <>
      <section className="card">
        <h2>3. Simples Nacional · declarações e parcelamentos</h2>
        <div className="grade" style={{ marginBottom: 12 }}>
          <div><span>Optante pelo Simples</span>{cadastro ? (cadastro.optanteSimples ? "Sim" : "Não") : "-"}</div>
          <div><span>No Simples desde</span>{inicioSimples ?? "-"}</div>
          {relatorio && relatorio.periodosSimples.some((p) => p.exclusao) && (
            <div><span>Exclusões anteriores</span>{relatorio.periodosSimples.filter((p) => p.exclusao).map((p) => `${p.inclusao} a ${p.exclusao}`).join("; ")}</div>
          )}
          <div><span>Débitos que impedem o Simples</span>{r.impeditivos > 0 ? <strong style={{ color: "var(--bad)" }}>{brl(r.impeditivos)}</strong> : "Nenhum"}</div>
        </div>
        <div className="linha nao-imprimir">
          <button className="sec" onClick={buscarObrigacoes} disabled={!integraAtivo || !cnpj} title={integraAtivo ? "" : "Integra Contador não configurado no servidor"}>
            Buscar PGDAS-D, DEFIS e parcelamentos
          </button>
        </div>
        {msgObrig && <p className="nota">{msgObrig}</p>}
        {obrig && (
          <div className="grade" style={{ marginTop: 8 }}>
            <div><span>PGDAS-D transmitidos</span>{obrig.periodos.filter((p) => p.declaracoes > 0).length} mês(es)</div>
            <div><span>PGDAS-D em atraso</span>{obrig.pgdasOmissos.length ? obrig.pgdasOmissos.map(mesAno).join(", ") : "Nenhum"}</div>
            <div><span>DEFIS em atraso</span>{obrig.defisOmissas.length ? obrig.defisOmissas.join(", ") : "Nenhuma"}</div>
            <div><span>DAS gerado e não pago</span>{obrig.dasNaoPagos.length ? obrig.dasNaoPagos.map(mesAno).join(", ") : "Nenhum"}</div>
            <div><span>Em malha</span>{obrig.periodos.filter((p) => p.malha).map((p) => `${mesAno(p.periodo)} (${p.malha})`).join(", ") || "Nenhum"}</div>
            <div><span>Parcelamentos do Simples</span>{obrig.parcelamentos.length ? obrig.parcelamentos.map((p) => `nº ${p.numero}${p.situacao ? ` · ${p.situacao}` : ""}`).join("; ") : "Nenhum"}</div>
          </div>
        )}
        <p className="nota">Os valores dos DAS em aberto, da dívida ativa e dos parcelamentos vêm do relatório de situação fiscal (seção 2). Declaração em atraso entra no mapa com a multa mínima; o DAS do mês aparece depois de transmitida.</p>
      </section>

      <section className="card nao-imprimir">
        <h2>4. Dados para o cálculo do Simples</h2>
        <div className="grade">
          <label>RBT12: receita dos 12 meses anteriores (R$)<input value={rbt12} onChange={(e) => setRbt12(e.target.value)} placeholder={`vazio = receita mensal × 12`} inputMode="decimal" /></label>
          <label>Meses de atividade (se menos de 12)<input value={meses} onChange={(e) => setMeses(e.target.value)} inputMode="numeric" /></label>
        </div>
        {sugestao && <p className="nota">Sugestão pelo CNAE {sugestao}</p>}
        <div className="tabela-rolagem" style={{ marginTop: 8 }}>
          <table>
            <thead>
              <tr><th>Atividade</th><th>Anexo</th><th className="num">Receita mensal (R$)</th><th className="num">% com ICMS-ST</th><th className="num">% monofásico</th><th className="num">% ISS retido</th><th className="num">% exportação</th><th /></tr>
            </thead>
            <tbody>
              {atividades.map((a, i) => (
                <tr key={i}>
                  <td><input value={a.descricao} onChange={(e) => mudar(i, "descricao", e.target.value)} /></td>
                  <td>
                    <select value={a.enquadramento} onChange={(e) => mudar(i, "enquadramento", e.target.value)}>
                      {ENQUADRAMENTOS.map((x) => <option key={x.v} value={x.v}>{x.t}</option>)}
                    </select>
                  </td>
                  <td><input value={a.receita} onChange={(e) => mudar(i, "receita", e.target.value)} inputMode="decimal" size={10} /></td>
                  <td><input value={a.st} onChange={(e) => mudar(i, "st", e.target.value)} inputMode="decimal" size={4} /></td>
                  <td><input value={a.mono} onChange={(e) => mudar(i, "mono", e.target.value)} inputMode="decimal" size={4} /></td>
                  <td><input value={a.ret} onChange={(e) => mudar(i, "ret", e.target.value)} inputMode="decimal" size={4} /></td>
                  <td><input value={a.exp} onChange={(e) => mudar(i, "exp", e.target.value)} inputMode="decimal" size={4} /></td>
                  <td>{atividades.length > 1 && <button className="mini" onClick={() => setAtividades(atividades.filter((_, j) => j !== i))}>remover</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="linha" style={{ margin: "8px 0 12px" }}>
          <button className="sec" onClick={() => setAtividades([...atividades, { descricao: "", enquadramento: "I", receita: "0", st: "0", mono: "0", ret: "0", exp: "0" }])}>Adicionar atividade (receita segregada)</button>
        </div>
        <div className="grade">
          <label>Salários dos empregados (R$/mês)<input value={salarios} onChange={(e) => setSalarios(e.target.value)} inputMode="decimal" /></label>
          <label>Pró-labore total dos sócios (R$/mês)<input value={proLabore} onChange={(e) => setProLabore(e.target.value)} inputMode="decimal" /></label>
          <label>Sócios com pró-labore<input value={socios} onChange={(e) => setSocios(e.target.value)} inputMode="numeric" /></label>
          <label>RAT × FAP (%)<input value={rat} onChange={(e) => setRat(e.target.value)} inputMode="decimal" /></label>
          <label>ISS do município fora do Simples (%)<input value={iss} onChange={(e) => setIss(e.target.value)} inputMode="decimal" /></label>
          {temComercio && <label>Carga efetiva de ICMS no regime normal (%)<input value={icms} onChange={(e) => setIcms(e.target.value)} inputMode="decimal" /></label>}
          <label>Compras com crédito de IBS/CBS (% da receita)<input value={compras} onChange={(e) => setCompras(e.target.value)} inputMode="decimal" /></label>
          <label>Vendas para empresas (% da receita)<input value={vendasPj} onChange={(e) => setVendasPj(e.target.value)} inputMode="decimal" /></label>
          <label>Honorário Simples (R$/mês)<input value={honSimples} onChange={(e) => setHonSimples(e.target.value)} inputMode="decimal" /></label>
          <label>Honorário Lucro Presumido (R$/mês)<input value={honPresumido} onChange={(e) => setHonPresumido(e.target.value)} inputMode="decimal" /></label>
          <label>Honorário de baixa (R$)<input value={honBaixa} onChange={(e) => setHonBaixa(e.target.value)} inputMode="decimal" /></label>
          <label style={{ flexDirection: "row", alignItems: "center", gap: 8 }}><input type="checkbox" checked={provisoes} onChange={(e) => setProvisoes(e.target.checked)} /> Somar 13º e férias na folha</label>
          <label style={{ flexDirection: "row", alignItems: "center", gap: 8 }}><input type="checkbox" checked={vedada} onChange={(e) => setVedada(e.target.checked)} /> Atividade vedada ao Simples</label>
        </div>
      </section>

      <section className="card">
        <h2>5. Apuração do Simples (mês médio)</h2>
        <div className="grade" style={{ marginBottom: 12 }}>
          <div><span>RBT12</span>{brl(ap.rbt12)}</div>
          <div><span>Folha 12 meses (fator R)</span>{brl(ap.folha12m)}</div>
          <div><span>Fator R</span>{pct(ap.fatorR, 1)}</div>
          <div><span>Limite / sublimite</span>{brl(r.parametros.limitesSimples.limite)} / {brl(r.parametros.limitesSimples.sublimite)}</div>
          <div><span>DAS do mês</span><strong>{brl(ap.dasMensal)}</strong></div>
        </div>
        <div className="tabela-rolagem">
          <table>
            <thead><tr><th>Atividade</th><th>Anexo</th><th className="num">Faixa</th><th className="num">Nominal</th><th className="num">Dedução</th><th className="num">Efetiva</th><th className="num">Efetiva final</th><th className="num">Receita</th><th className="num">DAS</th></tr></thead>
            <tbody>
              {ap.atividades.map((a, i) => (
                <tr key={i}>
                  <td>{a.descricao}</td><td>{a.anexo}</td><td className="num">{a.faixa.faixa}ª</td>
                  <td className="num">{pct(a.faixa.nominal)}</td><td className="num">{brl(a.faixa.deducao)}</td><td className="num">{pct(a.faixa.efetiva)}</td>
                  <td className="num">{pct(a.aliquotaFinal)}</td><td className="num">{brl(a.receitaMensal)}</td><td className="num">{brl(a.das)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {tributos.length > 0 && (
          <div className="tabela-rolagem" style={{ marginTop: 8 }}>
            <table>
              <thead><tr>{tributos.map(([t]) => <th key={t} className="num">{t}</th>)}</tr></thead>
              <tbody><tr>{tributos.map(([t, v]) => <td key={t} className="num">{brl(v ?? 0)}</td>)}</tr></tbody>
            </table>
          </div>
        )}
        {ap.foraDoDas.length > 0 && <ul className="nota">{ap.foraDoDas.map((l) => <li key={l.item}>{l.item}: {brl(l.valor)}</li>)}</ul>}
        {ap.alertas.map((a) => <div key={a} className="alerta">{a}</div>)}
        <h3 className="orgao">Pró-labore e fator R</h3>
        <p className={r.proLabore.aplicavel ? "" : "nota"}>{r.proLabore.explicacao}</p>
      </section>

      <section className="card">
        <h2>6. Caminhos</h2>
        <div className="divida-total">
          <div><span>Dívida total do cliente</span><strong>{brl(r.totalDebitos)}</strong></div>
          {r.impeditivos > 0 && <div><span>Sem exigibilidade suspensa</span><strong>{brl(r.impeditivos)}</strong></div>}
          <div className="nota">Soma de todas as pendências do mapa, pelo valor total, sem limite de prazo. Aparece à parte do custo de 12 meses.</div>
        </div>
        <p>{r.justificativa}</p>
        <div className="cenarios">
          {r.cenarios.map((c) => <CartaoCenario key={c.codigo} c={c} melhor={c.codigo === r.recomendado} />)}
        </div>
        <p className="nota">Custo em 12 meses = impostos, encargos e honorários do próximo ano, com a receita e a folha informadas. Estimativa de apoio à decisão.</p>
      </section>

      <section className="card">
        <h2>7. Reforma Tributária: IBS e CBS no Simples</h2>
        <p className="nota">
          Tributos sobre o faturamento por mês, sem folha e honorários. Simples puro: IBS e CBS dentro do DAS, valor igual ao de hoje. Simples híbrido: IBS e CBS por fora, pela alíquota cheia, descontando os créditos das compras ({pct(entrada.comprasComCredito, 0)} da receita). Alíquotas cheias estimadas até a fixação pelo Senado.
        </p>
        <div className="tabela-rolagem">
          <table>
            <thead><tr><th>Ano</th><th className="num">CBS + IBS</th><th className="num">Simples puro</th><th className="num">Crédito ao comprador</th><th className="num">Simples híbrido</th><th className="num">Crédito ao comprador</th><th className="num">Lucro Presumido</th></tr></thead>
            <tbody>
              {r.reforma.map((a) => (
                <tr key={a.ano}>
                  <td>{a.ano}</td><td className="num">{pct(a.cbs + a.ibs, 1)}</td>
                  <td className="num">{brl(a.simplesPuro)}</td><td className="num">{brl(a.creditoComprador)}</td>
                  <td className="num">{a.simplesHibrido !== undefined ? brl(a.simplesHibrido) : "-"}</td>
                  <td className="num">{a.creditoCompradorHibrido !== undefined ? brl(a.creditoCompradorHibrido) : "-"}</td>
                  <td className="num">{brl(a.presumido)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="nota">
          {entrada.vendasParaEmpresas >= 0.5
            ? "A maior parte das vendas é para empresas: o comprador pode preferir quem gera crédito integral, então vale avaliar o Simples híbrido."
            : "A maior parte das vendas é para consumidor final: o Simples puro tende a continuar mais simples e barato."}
        </p>
        <details className="nota">
          <summary>Valores legais usados (vigentes em {r.parametros.data.split("-").reverse().join("/")})</summary>
          <ul>{r.parametros.fontes.map((f) => <li key={f.item}>{f.item}: {f.fonte}, desde {f.vigenteDesde.split("-").reverse().join("/")}</li>)}</ul>
        </details>
      </section>
    </>
  );
}
