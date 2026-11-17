# Análise de Clientes · NEVES CONT

App web para analisar um cliente pelo CNPJ: situação cadastral, mapa de débitos e comparação de caminhos.
Primeira etapa: **MEI**. Depois: Simples Nacional, Lucro Presumido e Lucro Real.

## O que a etapa do MEI faz

1. Consulta o cadastro público do CNPJ (BrasilAPI): situação, atividades, opção pelo MEI e pelo Simples.
2. Monta o mapa de pendências: débitos trazidos do Integra Contador ou lançados a partir do relatório de situação fiscal.
3. Compara quatro caminhos: (A) regularizar e continuar MEI, (B) regularizar e dar baixa, (C) dar baixa com os débitos e abrir ME/SLU no Simples, (D) desenquadrar para ME no mesmo CNPJ.
4. Calcula o desembolso em 12 meses de cada um (regularização, DAS, Simples com fator R, INSS e IRRF do pró-labore, honorários) e marca o menor.
5. Imprime ou salva em PDF para o cliente.

Os valores legais ficam em `src/lib/motor/parametros.ts`. Os marcados com **CONFERIR** precisam de validação do contador.

## Rodar localmente

```bash
npm install
npm run dev      # http://localhost:3000
npm test         # testes do motor de cálculo
```

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
