

## Fix: Rentabilidade Carteira de Investimentos (19,73% → 19,68%)

### Causa raiz

A **Posição Consolidada** calcula a rentabilidade passando todos os produtos (RF + Câmbio) como um pool único para `calcularCarteiraRendaFixa` (linha 468), que usa `base = prevLiquido + aplicacoes` para o denominador diário.

A **Carteira de Investimentos** usa `calcularCarteiraInvestimentos`, que agrega a partir dos rows das sub-carteiras (que já são consolidados e **não carregam aplicações individuais** — `aplicacoes` é sempre 0). Resultado: o denominador é apenas `prevPatrimonio`, sem considerar fluxos intradiários, gerando divergência.

### Solução

Eliminar o uso de `calcularCarteiraInvestimentos` na página e usar `calcularCarteiraRendaFixa` com todos os product rows combinados — exatamente como a Posição Consolidada faz.

### Alterações

**Arquivo:** `src/pages/CarteiraInvestimentosPage.tsx`

1. Na seção "5. Consolidate" (linhas 380-387), substituir:
```ts
const consolidated = calcularCarteiraInvestimentos({
  rfRows: rfResult,
  cambioRows: cambioResult,
  dataInicio: globalDataInicio,
  dataCalculo: globalDataCalculo,
});
```
Por:
```ts
const allProductRows = [...rfProdRows, ...cambioProdRows];
const consolidatedRF = allProductRows.length > 0
  ? calcularCarteiraRendaFixa({ productRows: allProductRows as any, calendario, dataInicio: globalDataInicio, dataCalculo: globalDataCalculo })
  : [];
// Adapt CarteiraRFRow[] to ConsolidatedDailyRow[]
const consolidated: ConsolidatedDailyRow[] = consolidatedRF.map(r => ({
  data: r.data,
  diaUtil: r.diaUtil,
  patrimonio: r.liquido,
  aplicacoes: 0,
  resgates: 0,
  ganhoDiarioRS: r.rentDiariaRS,
  ganhoAcumuladoRS: r.rentAcumuladaRS,
  rentDiariaPct: r.rentDiariaPct,
  rentAcumuladaPct: r.rentAcumuladaPct,
}));
```

2. Remover import de `calcularCarteiraInvestimentos` (linha 10)

Isso garante que ambas as páginas usem exatamente a mesma fórmula. A tabela de rentabilidade detalhada também receberá os valores corretos pois consome os `consolidatedRows`.

