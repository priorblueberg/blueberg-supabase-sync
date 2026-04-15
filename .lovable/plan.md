

## Fix: Rentabilidade da Carteira de Investimentos (19.66% → 19.68%)

### Causa raiz
`calcularCarteiraInvestimentos` usa média ponderada dos retornos das sub-carteiras (RF e Câmbio) pelo patrimônio anterior. Com fluxos (aplicações/resgates), isso diverge do cálculo direto usado na Posição Consolidada.

### Alteração

**Arquivo:** `src/lib/carteiraInvestimentosEngine.ts`

1. Remover interface `SubPart` e campo `subParts` do `dateMap`
2. Adicionar variável `prevPatrimonio` para rastrear patrimônio do dia anterior
3. Substituir cálculo weighted average por fórmula direta

```ts
// ANTES (linhas 83-87):
const totalPrev = agg.subParts.reduce((s, p) => s + p.prevLiq, 0);
const rentDiariaPct = totalPrev > 0.01
  ? agg.subParts.reduce((s, p) => s + p.rentDiariaPct * p.prevLiq, 0) / totalPrev
  : 0;

// DEPOIS:
const rentDiariaPct = prevPatrimonio > 0.01
  ? agg.ganhoDiarioRS / prevPatrimonio
  : 0;
```

E no final do loop: `prevPatrimonio = agg.patrimonio;`

Com 1 carteira ou N carteiras, o resultado será idêntico à Posição Consolidada.

