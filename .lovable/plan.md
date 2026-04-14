

## Bug: Rentabilidade da Carteira Investimentos diverge da Carteira Renda Fixa

### Causa raiz

As duas engines usam formulas diferentes para calcular a base da rentabilidade diaria (TWR):

**Carteira RF (correta):**
```text
base = prevLiquido + aplicacoes
rentDiaria = rentDiariaRS / base
```
Usa o patrimonio do dia anterior + aplicacoes do dia como denominador.

**Carteira Investimentos (incorreta):**
```text
base = patrimonio - ganhoDiarioRS
rentDiaria = ganhoDiarioRS / base
```
Deduz o ganho do patrimonio atual. Isso e matematicamente diferente porque nao desconta resgates e inclui implicitamente movimentacoes no denominador de forma errada. Alem disso, `aplicacoes` e `resgates` sao sempre `0` — nunca sao preenchidos.

### Correcao

**Arquivo:** `src/lib/carteiraInvestimentosEngine.ts`

1. Na funcao `addRows`, passar tambem `aplicacoes` e `resgates` da serie RF (campos que ja existem como zero mas precisam refletir os valores reais — neste caso nao precisamos deles explicitamente, pois a serie RF ja calcula `rentDiariaPct` corretamente).

2. A abordagem mais simples e correta: **usar a rentabilidade diaria ja calculada pela Carteira RF** (`rentDiariaPct`) ao inves de recalcular. Quando so existe uma carteira segmentada, basta compor os `rentDiariaPct` da RF. Quando existem multiplas, recalcular usando a mesma logica da RF (`prevLiquido + aplicacoes`).

Implementacao concreta — alinhar com a logica da RF:

```ts
// Adicionar prevPatrimonio e rastrear aplicacoes
const addRows = (rows: CarteiraRFRow[]) => {
  for (const r of rows) {
    if (r.data < dataInicio || r.data > dataCalculo) continue;
    const existing = dateMap.get(r.data);
    if (existing) {
      existing.patrimonio += r.liquido;
      existing.ganhoDiarioRS += r.rentDiariaRS;
    } else {
      dateMap.set(r.data, {
        diaUtil: r.diaUtil,
        patrimonio: r.liquido,
        aplicacoes: 0,
        resgates: 0,
        ganhoDiarioRS: r.rentDiariaRS,
      });
    }
  }
};

// No loop principal, trocar:
//   const base = agg.patrimonio - agg.ganhoDiarioRS;
// Por:
//   const base = prevPatrimonio;  (patrimonio do dia anterior)
// E adicionar tracking de prevPatrimonio
```

Mudanca especifica:

```ts
let prevPatrimonio = 0;

for (const [data, agg] of sorted) {
  const base = prevPatrimonio;
  const rentDiariaPct = base > 0.01 ? agg.ganhoDiarioRS / base : 0;
  ganhoAcumulado += agg.ganhoDiarioRS;
  rentAcumuladaFactor *= (1 + rentDiariaPct);

  result.push({ ... });

  prevPatrimonio = agg.patrimonio;
}
```

Isso espelha exatamente a logica `prevLiquido` da Carteira RF (que nao tem aplicacoes intermediarias na carteira consolidada, pois todas as aplicacoes ja foram processadas dentro de cada produto).

### Impacto
- A rentabilidade da Carteira Investimentos passara a coincidir com a da Carteira RF (29,44%).
- Quando houver Cambio, a composicao continuara correta pois usa a mesma logica TWR.

