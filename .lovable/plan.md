

## Bug: Rentabilidade do título Quadrimestral cai no dia do vencimento (26,28% vs 31,59%)

### Causa raiz

A correção anterior (para incluir juros de "No Vencimento" nos Proventos) introduziu uma regressão no cálculo do **Valor da Cota** no dia do vencimento.

**Linha 492** do engine:
```ts
// isFinalDay:
valorCota1 = saldoCotas2 > 0 ? resgatesTotal / saldoCotas2 : prevValorCota;
```

O problema: `resgatesTotal` agora exclui `jurosPago` (linha 429: `resgatesTotal = prevLiquido * (1 + dailyMult) - jurosPago`). Antes da correção, `jurosPago` era zero no final, então `resgatesTotal` continha o valor total. Agora que `jurosPago > 0` no vencimento, a cota fica subestimada — falta a parcela dos juros.

Em dias normais de pagamento periódico, a fórmula já inclui juros: `(liquido1 + jurosPago) / saldoCotas1` (linha 495). O dia final precisa do mesmo tratamento.

### Correção

**Arquivo:** `src/lib/rendaFixaEngine.ts`, linha 492

```ts
// Antes:
valorCota1 = saldoCotas2 > 0 ? resgatesTotal / saldoCotas2 : prevValorCota;

// Depois:
valorCota1 = saldoCotas2 > 0 ? (resgatesTotal + jurosPago) / saldoCotas2 : prevValorCota;
```

Isso garante que o Valor da Cota no vencimento reflete o patrimônio total (capital + juros), mantendo a rentabilidade acumulada correta (31,59%).

### Impacto
- Título Quadrimestral voltará a mostrar 31,59% no vencimento.
- Títulos "No Vencimento" também terão a rentabilidade correta no dia final.
- Juros continuam aparecendo corretamente na página de Proventos (a decomposição capital/juros não muda).

