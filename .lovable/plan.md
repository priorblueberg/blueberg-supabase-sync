

## Fix: Rentabilidade % da Poupança — restaurar composição diária patrimonial

### Escopo
Apenas `src/lib/poupancaEngine.ts`, linhas 338-346 e 363/381-383. Nenhum outro arquivo será alterado.

### Alteração

Substituir o cálculo de rentabilidade simples (linhas 338-346) pela composição diária patrimonial:

**Antes:**
```ts
const aporteLiquido = totalAplicacoes - totalResgates;
rentAcum2 = aporteLiquido > 0.01 ? ganhoAcumulado / aporteLiquido : 0;
const prevRentAcum = idx > 0 ? rows[idx - 1].rentAcumulada2 : 0;
const rentDiariaPct = (1 + prevRentAcum) > 0.0000001
  ? (1 + rentAcum2) / (1 + prevRentAcum) - 1
  : 0;
```

**Depois:**
```ts
const prevLiquido = idx > 0 ? rows[idx - 1].liquido : 0;
const baseRentabilidade = prevLiquido + mov.aplicacoes;
const rentDiariaPct = baseRentabilidade > 0.01 ? ganhoDiario / baseRentabilidade : 0;
rentAcum2 = (1 + rentAcum2) * (1 + rentDiariaPct) - 1;
```

A variável `rentAcum2` passa a ser inicializada como `0` (já é) e acumulada por composição. Os campos do DailyRow (`rentabilidadeAcumuladaPct`, `rentAcumulada2`, `rentDiariaPct`, `rentabilidadeDiaria`) permanecem mapeados para os mesmos valores — nenhuma interface muda.

### O que NÃO muda
- Nenhuma carteira consolidada
- `carteiraRendaFixaEngine.ts`
- Nenhum outro engine ou página
- `ganhoDiario` e `ganhoAcumulado` em R$ permanecem iguais

