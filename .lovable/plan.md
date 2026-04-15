

## Diagnóstico: Absorção pós-resgate elimina lotes com aniversários diferentes

### Causa raiz

Linhas 314-330 de `poupancaEngine.ts`: após um resgate parcial, o código **absorve** o próximo lote ativo no lote-fronteira. Isso:

1. **Elimina o aniversário do lote absorvido.** No seu caso, o lote do dia 11 (aniversário 11, que cai no dia ~27 por causa do offset ou outro lote com dia 27) é absorvido pelo lote-fronteira do dia 23, perdendo o aniversário do dia 27 para sempre.

2. **Infla o valor do lote-fronteira**, fazendo com que o rendimento do aniversário dia 23 seja calculado sobre uma base muito maior (soma dos dois lotes), gerando R$ 291,92 em vez dos R$ 164,45 que o Gorila calcula apenas sobre o valor do lote com aniversário dia 23.

O Gorila **não absorve lotes**. Cada lote mantém seu próprio aniversário independentemente, mesmo após resgates parciais.

### Alteração

**Arquivo:** `src/lib/poupancaEngine.ts`, linhas 314-331

**Remover inteiramente o bloco de absorção pós-resgate:**

```ts
// REMOVER este bloco (linhas 314-331):
      // Absorção pós-resgate: quando há consumo parcial (lote-fronteira),
      // o próximo lote ativo na ordem FIFO é absorvido pelo fronteira,
      // mantendo o aniversário do fronteira e eliminando o absorvido.
      if (frontierLote) {
        const nextLote = sortedActive.find(
          (l) => l.status === "ativo" && l.id !== frontierLote!.id && l.valorAtual > 0.01
            && l.dataAplicacao > frontierLote!.dataAplicacao
        );
        if (nextLote) {
          frontierLote.valorPrincipal += nextLote.valorPrincipal;
          frontierLote.valorAtual += nextLote.valorAtual;
          frontierLote.rendimentoAcumulado += nextLote.rendimentoAcumulado;
          nextLote.valorAtual = 0;
          nextLote.valorPrincipal = 0;
          nextLote.rendimentoAcumulado = 0;
          nextLote.status = "resgatado";
        }
      }
```

Cada lote passa a manter seu próprio aniversário de forma independente após resgates, alinhando ao comportamento do Gorila.

### O que NÃO muda
- Lógica de resgate FIFO (consumo total e parcial) permanece
- Carteiras consolidadas intocadas
- `carteiraRendaFixaEngine.ts` intocado
- Nenhum outro engine ou página

