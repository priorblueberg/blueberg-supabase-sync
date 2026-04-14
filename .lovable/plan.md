

## Correção: Rentabilidade quebrada para títulos "No Vencimento"

### Causa raiz

A alteração anterior separou `jurosPago` do `resgatesTotal` no `isFinalDay` para que Proventos funcionasse. Porém, na linha 492, o `valorCota1` (que determina a rentabilidade) passou a usar apenas `resgatesTotal` (capital), excluindo juros:

```ts
// Linha 490-492 — ANTES da alteração, resgatesTotal incluía juros
valorCota1 = saldoCotas2 > 0 ? resgatesTotal / saldoCotas2 : prevValorCota;
```

Agora `resgatesTotal = patrimônio - jurosPago`, então a cota final fica menor e a rentabilidade zera ou fica errada.

### Correção

**Arquivo:** `src/lib/rendaFixaEngine.ts`, linha 492

Incluir `jurosPago` no cálculo do valor da cota no dia final:

```ts
// De:
valorCota1 = saldoCotas2 > 0 ? resgatesTotal / saldoCotas2 : prevValorCota;

// Para:
valorCota1 = saldoCotas2 > 0 ? (resgatesTotal + jurosPago) / saldoCotas2 : prevValorCota;
```

Isso mantém a decomposição correta para Proventos (`jurosPago` separado) enquanto preserva o valor da cota total para cálculo de rentabilidade.

### Impacto
- Rentabilidade dos títulos "No Vencimento" volta ao normal (DPGE UBS, CDB Bradesco).
- Proventos continua listando o juros corretamente (usa `pagamentoJuros`, não `valorCota`).
- Títulos com pagamento periódico não são afetados (já usavam o branch `isPagamento`).

