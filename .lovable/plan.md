
Objetivo: corrigir somente a exibição de juros/amortização para títulos `engine = "CDBLIKE"` + `indexador = "IPCA"`, usando os valores recalculados pelo engine (`DailyRow.jurosPago` e `DailyRow.resgates`) em vez de derivar amortização a partir de movimentações automáticas antigas persistidas.

## Plano de implementação

1. Criar um helper isolado para movimentos derivados do engine IPCA
   - Adicionar uma função utilitária em `src/lib` para transformar `DailyRow[]` em lançamentos de exibição:
     - `Pagamento de Juros` usando `row.jurosPago`
     - `Amortização` usando `row.resgates`
   - A função só será usada quando:
     - `engine === "CDBLIKE"`
     - `indexador === "IPCA"`
   - Não alterará o engine em si, apenas a camada de apresentação.

2. Ajustar o detalhamento do título (`PosicaoDetalheDialog`)
   - Passar para o diálogo, além de `pagamentosJuros`, as amortizações calculadas pelo engine para o título IPCA.
   - Para `CDBLIKE + IPCA`:
     - ocultar/substituir a linha automática persistida de `Resgate no Vencimento` / `Resgate Total` quando ela estiver sendo usada apenas como base antiga;
     - exibir a amortização com o valor vindo de `engineRow.resgates`;
     - exibir os juros com o valor vindo de `engineRow.jurosPago`.
   - Remover, apenas nesse caminho IPCA, a regra atual:
     - `amortização = movimentacao.valor - jurosDoDia`
   - Manter a regra atual para CDI, Prefixado, Poupança e demais engines.

3. Ajustar a página geral de movimentações (`MovimentacoesPage`)
   - Buscar também os dados mínimos de `custodia` + `produtos.engine` para identificar quais `codigo_custodia` são `CDBLIKE + IPCA`.
   - Para esses códigos, recalcular as linhas via `calcularRendaFixaDiario` com os mesmos insumos já usados nas demais páginas:
     - calendário de dias úteis;
     - CDI quando necessário;
     - movimentações do ativo;
     - `calendario_ipca` via helper;
     - parâmetros do título.
   - Substituir, somente na exibição dessas linhas IPCA, os lançamentos automáticos antigos por lançamentos derivados do engine:
     - `Pagamento de Juros` = `jurosPago`
     - `Amortização` = `resgates`
   - Preservar movimentações manuais e aplicações normalmente.
   - Preservar o comportamento atual para todos os demais títulos.

4. Cuidar de ordenação, filtros e ações
   - Garantir que as linhas sintéticas derivadas do engine apareçam com:
     - `origem = "automatico"`
     - sem botão de edição/exclusão
     - `quantidade` e `preco_unitario` como `null`, igual aos pagamentos de juros automáticos.
   - Manter os filtros por nome e tipo funcionando.
   - Garantir que a ordenação por data continue estável.

5. Invalidar caches de apresentação quando necessário
   - Atualizar o cache da `MovimentacoesPage` para considerar a nova composição derivada do engine.
   - Se necessário, incrementar a versão do cache do engine apenas se houver mudança em parâmetro de cálculo. Como a regra é de exibição, a princípio não será necessário mexer no cálculo nem no cache global do engine.

6. Validação
   - Conferir que, para `CDBLIKE + IPCA`, a soma:
     - `Amortização` + `Pagamento de Juros`
     passa a bater com o total correto recalculado pelo engine.
   - Conferir que `CDBLIKE + CDI` e `CDBLIKE + Prefixado` continuam usando a lógica anterior.
   - Rodar build/typecheck para garantir que as alterações não quebrem a aplicação.

## Escopo técnico

Arquivos previstos:
- `src/components/PosicaoDetalheDialog.tsx`
- `src/pages/PosicaoConsolidadaPage.tsx`
- `src/pages/MovimentacoesPage.tsx`
- possivelmente um novo helper em `src/lib`, por exemplo `engineMovementsDisplay.ts`

Regra principal:
```ts
const isIpcaCdblike = engine === "CDBLIKE" && indexador === "IPCA";

if (isIpcaCdblike) {
  juros = engineRow.jurosPago;
  amortizacao = engineRow.resgates;
} else {
  // comportamento atual preservado
  amortizacao = movimentacao.valor - jurosDoDia;
}
```

Resultado esperado:
- IPCA usa exclusivamente `jurosPago` e `resgates` calculados pelo engine recalculado.
- Movimentações persistidas antigas deixam de distorcer a separação entre amortização e juros.
- CDI e Prefixado permanecem sem alteração de comportamento.
