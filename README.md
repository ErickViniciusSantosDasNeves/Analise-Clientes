# Análise de Clientes · NEVES CONT

App web para analisar um cliente pelo CNPJ: situação cadastral, mapa de débitos e comparação de caminhos.
Primeira etapa: **MEI**. Depois: Simples Nacional, Lucro Presumido e Lucro Real.

## O que a etapa do MEI faz

1. Consulta o cadastro público do CNPJ (BrasilAPI): situação, atividades, opção pelo MEI e pelo Simples.
2. Monta o mapa de pendências: lê o PDF do Relatório de Situação Fiscal do e-CAC (SIEF, Simples, dívida ativa, parcelamentos), traz débitos do Integra Contador ou aceita lançamento manual.
3. Mostra a dívida total do cliente e compara três caminhos: (A) regularizar e continuar MEI, (B) regularizar e dar baixa, (C) transformar o MEI em ME no mesmo CNPJ.
4. Calcula o custo de 12 meses de cada caminho (DAS, Simples com fator R, INSS e IRRF do pró-labore, honorários), com a dívida total à parte, e marca o menor.
5. Imprime ou salva em PDF para o cliente.

## O que a etapa do Simples Nacional faz

Aparece quando o CNPJ é optante pelo Simples (ou com "Analisar como Simples Nacional mesmo assim").

1. Declarações e parcelamentos pelo Integra Contador: PGDAS-D transmitidos por mês (PGDASD), DEFIS (DEFIS) e pedidos de parcelamento (PARCSN). Meses sem PGDAS-D e anos sem DEFIS já vencidos entram no mapa de débitos com a multa mínima. DAS em aberto, dívida ativa e parcelamentos com valor continuam vindo do relatório de situação fiscal.
2. Apuração do DAS por atividade (receitas segregadas), Anexos I a V, com a partilha de cada tributo, limite do ISS de 5%, fator R, sublimite de R$ 3,6 milhões (ICMS e ISS por fora), limite de R$ 4,8 milhões, CPP fora do DAS no Anexo IV, ICMS-ST, PIS/Cofins monofásico, ISS retido e exportação. RBT12 proporcional no início de atividade.
3. Pró-labore pelo fator R: quanto de pró-labore leva ao Anexo III e se a economia no DAS supera o INSS e o IRRF a mais.
4. Caminhos: (A) regularizar e permanecer no Simples, (B) permanecer com o pró-labore do fator R, (C) migrar para o Lucro Presumido (com a majoração da LC 224/2025), (D) regularizar e dar baixa (só o honorário). A dívida total aparece à parte.
5. Reforma Tributária: Simples puro x Simples híbrido x Lucro Presumido de 2026 a 2033, com o crédito de IBS/CBS que o comprador aproveita.

Os códigos dos serviços DEFIS e PARCSN do Integra Contador estão marcados para conferir no catálogo do Serpro (`src/lib/fontes/integra-contador.ts`).

## Valores legais por vigência

Os valores legais ficam em `src/lib/motor/parametros.ts`, cada um com o histórico de versões: data em que passa a valer e a norma.
O app usa automaticamente a versão vigente na data da análise. Quando sai uma lei nova, basta acrescentar uma linha com a data de vigência; os valores antigos continuam valendo para análises de períodos anteriores.
Os marcados com **CONFERIR** precisam de validação do contador.

## Privacidade

O PDF do relatório é lido na memória do servidor e descartado; nada é gravado. Não coloque relatórios reais de clientes no repositório: os testes usam um relatório fictício em `tests/fixtures/`.

## Rodar localmente

```bash
npm install
npm run dev      # http://localhost:3000
npm test         # testes do motor de cálculo
```

## Publicar na Vercel

1. Crie uma conta em vercel.com entrando com o GitHub.
2. "Add New Project" e importe o repositório `analise-clientes`. A Vercel detecta o Next.js sozinha.
3. Em Settings > Environment Variables, cadastre as variáveis do Integra Contador abaixo.
4. Cadastre também `APP_USUARIO` e `APP_SENHA`: o app pede esse login antes de abrir qualquer tela ou consulta. Sem elas, o app fica fechado.

## Integra Contador (busca automática no e-CAC)

Com o Integra Contador configurado, ao consultar um CNPJ o app busca sozinho o **Relatório de Situação Fiscal** na Receita (serviço SITFIS), lê as pendências e oferece o PDF para baixar. O upload do PDF continua como alternativa.

Cadastre na Vercel em **Settings > Environment Variables**, marcando **Production** e **Preview** e a opção **Sensitive**:

| Variável | O que é |
| --- | --- |
| `INTEGRA_CONSUMER_KEY` | Consumer Key da área do cliente Serpro |
| `INTEGRA_CONSUMER_SECRET` | Consumer Secret da área do cliente Serpro |
| `INTEGRA_CERT_PFX_BASE64` | Certificado e-CNPJ A1 do escritório (.pfx) convertido em base64 |
| `INTEGRA_CERT_SENHA` | Senha do certificado |
| `INTEGRA_CNPJ_CONTRATANTE` | CNPJ do escritório (contratante do Integra Contador) |

Para converter o .pfx em base64 no Windows (PowerShell), o resultado vai para a área de transferência:

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("C:\caminho\certificado.pfx")) | Set-Clipboard
```

Depois de salvar, faça **Redeploy** em Deployments. Cada cliente consultado precisa ter dado **procuração eletrônica** ao escritório no e-CAC. A emissão do relatório é tarifada pelo Serpro.

## Estrutura

- `src/lib/fontes/`: um conector por fonte de dados (BrasilAPI, Integra Contador).
- `src/lib/motor/`: regras e cálculos. Um módulo por regime; hoje `mei.ts`.
- `src/app/`: telas e rotas da API.
