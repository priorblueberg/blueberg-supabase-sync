

## Bug: Rentabilidade quebrada após correção de Proventos

### Causa raiz

A alteração anterior fez `jurosPago > 0` no `isFinalDay` para todos os títulos (inclusive "No Vencimento"). Isso afetou o cálculo de `valorCota1` no dia final, que é a base da rentabilidade.

**Linha 490-492 do engine:**
```ts
// Final day: Resgate / Saldo de Cotas (2)
valorCota1 = saldoCotas2 > 0 ? resgatesTotal / saldoCotas2 : prevValorCota;
```

Antes da alteração, `jurosPago` era 0 no final, então `resgatesTotal` continha o valor total (capital + juros). Agora, `resgatesTotal = total - jurosPago` (só capital), mas `valorCota1` continua dividindo apenas `resgatesTotal` por `saldoCotas2`. Resultado: cota final subestimada → rentabilidade errada.

A prova: para títulos com pagamento periódico (que já separavam juros antes), a linha 494-495 faz `(liquido1 + jurosPago) / saldoCotas1` — ou seja, adiciona juros de volta. O `isFinalDay` precisa do mesmo tratamento.

### Correção

**Arquivo:** `src/lib/rendaFixaEngine.ts`, linha 492

```ts
// Antes:
valorCota1 = saldoCotas2 > 0 ? resgatesTotal / saldoCotas2 : prevValorCota;

// Depois:
valorCota1 = saldoCotas2 > 0 ? (resgatesTotal + jurosPago) / saldoCotas2 : prevValorCota;
```

Isso reconstitui o valor total por cota no dia final, igual ao que era antes da alteração. A rentabilidade volta ao normal sem afetar a página de Proventos (que usa `pagamentoJuros`, não `valorCota`).

### Impacto
- Rentabilidades voltam aos valores corretos para todos os títulos liquidados
- Proventos continua funcionando (sem alteração)
- Títulos em custódia não são afetados (não passam por `isFinalDay`)

