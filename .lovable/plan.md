

## Fix: Carteira Moedas — base de rentabilidade não subtrai resgates

### Causa raiz

A `CarteiraCambioPage` usa `calcularCarteiraRendaFixa` para calcular o TWR da carteira. Essa função calcula a base como `prevLiquido + aplicacoes`, sem subtrair `resgates`. As adapted rows já enviam `resgates` (linha 247), mas o engine ignora esse campo.

Como a restrição é **não mexer em `carteiraRendaFixaEngine.ts`**, a solução é criar uma função de cálculo TWR local na `CarteiraCambioPage` que inclua resgates na base.

### Alteração

**Arquivo:** `src/pages/CarteiraCambioPage.tsx`

1. Criar uma função `calcularCarteiraCambio` local (ou inline) que replica a lógica de `calcularCarteiraRendaFixa`, mas com `baseRentabilidade = prevLiquido + aplicacoes - resgates`.

2. Substituir a chamada `calcularCarteiraRendaFixa(...)` (linha 283) pela nova função.

3. Remover o import de `calcularCarteiraRendaFixa` se não for mais necessário.

**Lógica da nova função:**
```ts
function calcularCarteiraCambio(
  productRows: { data: string; diaUtil: boolean; liquido: number; aplicacoes: number; resgates: number; ganhoDiario: number }[][],
  calendario: { data: string; dia_util: boolean }[],
  dataInicio: string,
  dataCalculo: string,
): CarteiraRFRow[] {
  // Mesma agregação que carteiraRendaFixaEngine, mas inclui resgates
  // base = prevLiquido + aplicacoes - resgates
}
```

### O que NÃO muda
- `carteiraRendaFixaEngine.ts` — intocado
- Carteira de Renda Fixa — intocada
- Engines de produtos individuais — intocados
- Nenhuma outra página

