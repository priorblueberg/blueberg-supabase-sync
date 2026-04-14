

## Bug: Card de rentabilidade da Carteira Investimentos diverge da Carteira RF

### Causa raiz

A Carteira RF calcula a base da rentabilidade diária como:
```text
base = prevLiquido + aplicacoes
```

A Carteira Investimentos (engine consolidado) calcula como:
```text
base = prevPatrimonio    (sem aplicacoes)
```

O campo `aplicacoes` nunca é preenchido no engine consolidado (sempre `0`). Nos dias em que há aplicações, o denominador fica diferente, gerando uma rentabilidade diária ligeiramente diferente que se acumula ao longo do tempo (29,44% vs 29,48%).

A tabela de rentabilidade mensal mostra o valor correto porque usa `buildDetailRowsFromEngine`, que recalcula a partir dos dados adaptados. Já o card usa `consolidatedRows[last].rentAcumuladaPct` direto do engine consolidado.

### Correção

**Arquivo:** `src/lib/carteiraInvestimentosEngine.ts`

Em vez de recalcular `rentDiariaPct` a partir de R$ (perdendo a informação de `aplicacoes`), usar o `rentDiariaPct` já calculado corretamente pela carteira RF/Câmbio. Quando há apenas uma sub-carteira num dado dia, usar seu `rentDiariaPct` diretamente. Quando há múltiplas, ponderar pelo patrimônio do dia anterior.

Mudanças concretas:

1. No `addRows`, armazenar também o `rentDiariaPct` pré-calculado e o `prevLiquido` (patrimônio do dia anterior da sub-carteira) para ponderação:

```ts
const addRows = (rows: CarteiraRFRow[]) => {
  let prev = 0;
  for (const r of rows) {
    if (r.data < dataInicio || r.data > dataCalculo) continue;
    const existing = dateMap.get(r.data);
    if (existing) {
      existing.patrimonio += r.liquido;
      existing.ganhoDiarioRS += r.rentDiariaRS;
      existing.subParts.push({ prevLiq: prev, rentDiariaPct: r.rentDiariaPct });
    } else {
      dateMap.set(r.data, {
        diaUtil: r.diaUtil,
        patrimonio: r.liquido,
        aplicacoes: 0,
        resgates: 0,
        ganhoDiarioRS: r.rentDiariaRS,
        subParts: [{ prevLiq: prev, rentDiariaPct: r.rentDiariaPct }],
      });
    }
    prev = r.liquido;
  }
};
```

2. No loop principal, calcular `rentDiariaPct` como média ponderada pelo patrimônio anterior:

```ts
for (const [data, agg] of sorted) {
  // Weighted daily return from sub-portfolios
  const totalPrev = agg.subParts.reduce((s, p) => s + p.prevLiq, 0);
  const rentDiariaPct = totalPrev > 0.01
    ? agg.subParts.reduce((s, p) => s + p.rentDiariaPct * p.prevLiq, 0) / totalPrev
    : 0;

  ganhoAcumulado += agg.ganhoDiarioRS;
  rentAcumuladaFactor *= (1 + rentDiariaPct);
  // ...
  prevPatrimonio = agg.patrimonio;
}
```

### Impacto
- O card da Carteira Investimentos passará a mostrar exatamente o mesmo valor da Carteira RF (29,44%).
- Quando houver Câmbio, a ponderação pelo patrimônio anterior garante composição TWR correta entre sub-carteiras.
- A tabela de rentabilidade mensal continua inalterada (já estava correta).

