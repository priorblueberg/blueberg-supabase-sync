

## Fix: Base da rentabilidade diária em moedas

### Problema
A base (denominador) da rentabilidade diária não desconta os resgates. O ganho de R$ 83,60 é dividido por R$ 74.682,50 (aplicações brutas) em vez de R$ 69.682,60 (aplicações líquidas), resultando em 0,11% ao invés de 0,12%.

### Alteração

**Arquivo:** `src/lib/cambioEngine.ts` — linha 87

De:
```ts
const base = prevValor + aplicacoesBRL;
```

Para:
```ts
const base = prevValor + aplicacoesBRL - resgatesBRL;
```

Uma única linha. Nenhum outro arquivo afetado.

