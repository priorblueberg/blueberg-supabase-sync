

## Correção do cálculo de ganho diário — metodologia fluxo de caixa

### Simulação corrigida (29/02/2024)

Movimentações:
- Aplicação Inicial: R$ 49.833,00 / 4,9833 = 10.000 USD
- Aplicação: R$ 24.849,50 / 4,9699 = 5.000 USD
- Resgate: R$ 4.999,90 / 4,9999 = 1.000 USD
- PTAX fechamento: 4,9833

Posição final: 14.000 USD

```text
Ganho = valorFinal - (valorInicial + aplicações - resgates)
      = 14.000 × 4,9833 - (0 + 49.833,00 + 24.849,50 - 4.999,90)
      = 69.766,20 - 69.682,60
      = R$ 83,60 ✓  (igual ao Gorila)
```

A abordagem de preço médio com arredondamento gera diferença (R$ 83,65 com 5 casas, R$ 84,10 com 4 casas). A metodologia correta é **fluxo de caixa**: ganho = valor final − investimento líquido do dia. Não precisa de preço médio.

### Solução simplificada

**Arquivo:** `src/lib/cambioEngine.ts`

A fórmula atual já está quase certa (ganhoExistente + ganhoNovasCompras), mas falta subtrair o **ganho dos resgates**. A fórmula correta com fluxo de caixa:

```ts
// Antes de atualizar qtyMoeda:
const prevValor = prevQtyMoeda * lastCotacao;

// Depois de atualizar qtyMoeda:
const valorBRL = qtyMoeda * cotacaoDia;
const ganhoDiarioBRL = valorBRL - (prevValor + aplicacoesBRL - resgatesBRL);
```

Isso substitui os cálculos de `ganhoExistente` e `ganhoNovasCompras` por uma fórmula única que:
- Captura a revalorização da posição existente
- Captura o spread entre preço de compra e PTAX no dia da aplicação
- Captura o ganho/perda do resgate vs custo
- **Sem arredondamento de preço médio** — resultado exato

A base da rentabilidade diária: `base = prevValor + aplicacoesBRL` (sem mudar).

Nenhuma variável nova, nenhuma interface alterada. Só substituir 4 linhas de cálculo por 1.

