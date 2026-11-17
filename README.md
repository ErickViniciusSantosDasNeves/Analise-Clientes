# Análise de Clientes · NEVES CONT

App web para analisar um cliente pelo CNPJ: situação cadastral, mapa de débitos e comparação de caminhos.
Primeira etapa: **MEI**. Depois: Simples Nacional, Lucro Presumido e Lucro Real.

## O que a etapa do MEI faz

1. Consulta o cadastro público do CNPJ (BrasilAPI): situação, atividades, opção pelo MEI e pelo Simples.
2. Monta o mapa de pendências: lê o PDF do Relatório de Situação Fiscal do e-CAC (SIEF, Simples, dívida ativa, parcelamentos), traz débitos do Integra Contador ou aceita lançamento manual.
3. Mostra a dívida total do cliente e compara três caminhos: (A) regularizar e continuar MEI, (B) regularizar e dar baixa, (C) transformar o MEI em ME no mesmo CNPJ.
4. Calcula o custo de 12 meses de cada caminho (DAS, Simples com fator R, INSS e IRRF do pró-labore, honorários), com a dívida total à parte, e marca o menor.
5. Imprime ou salva em PDF para o cliente.

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

## Integra Contador

Configure como variáveis de ambiente do servidor (nunca no código nem no chat), conforme `.env.example`:

- `INTEGRA_CONSUMER_KEY` e `INTEGRA_CONSUMER_SECRET`: da área do cliente Serpro.
- `INTEGRA_CERT_PFX_BASE64` e `INTEGRA_CERT_SENHA`: certificado e-CNPJ A1 do escritório, em base64.
- `INTEGRA_CNPJ_CONTRATANTE`: CNPJ do escritório.

Cada cliente consultado precisa ter dado procuração eletrônica ao escritório no e-CAC.
Sem essas variáveis, o app funciona com lançamento manual dos débitos.

## Estrutura

- `src/lib/fontes/`: um conector por fonte de dados (BrasilAPI, Integra Contador).
- `src/lib/motor/`: regras e cálculos. Um módulo por regime; hoje `mei.ts`.
- `src/app/`: telas e rotas da API.
