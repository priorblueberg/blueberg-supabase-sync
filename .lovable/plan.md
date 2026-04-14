

## Cotação de moedas com 4 casas decimais

### Problema
A função `formatCurrency` formata valores com 2 casas decimais (`maximumFractionDigits: 2`). O campo de cotação para moedas (Aplicação e Resgate) usa essa mesma função, truncando a cotação PTAX que tem 4 casas decimais (ex: 4,9833 vira 4,98).

### Solução

**Arquivo:** `src/pages/CadastrarTransacaoPage.tsx`

1. **Criar `formatCotacao4`** — nova função similar a `formatCurrency` mas com 4 casas decimais:
   - Divide por 10000 ao invés de 100
   - Usa `minimumFractionDigits: 4, maximumFractionDigits: 4`

2. **Atualizar pre-fill da cotação na Aplicação** (linha ~686):
   - De: `formatCurrency(Math.round(cot * 100).toString())`
   - Para: `formatCotacao4(Math.round(cot * 10000).toString())`

3. **Atualizar pre-fill da cotação no Resgate** (linha ~480):
   - De: `formatCurrency(Math.round(cotRef * 100).toString())`
   - Para: `formatCotacao4(Math.round(cotRef * 10000).toString())`

4. **Atualizar onChange do campo cotação Aplicação** (linha ~1452):
   - De: `formatCurrency(e.target.value)`
   - Para: `formatCotacao4(e.target.value)`

5. **Atualizar onChange do campo cotação Resgate** (linha ~1634):
   - De: `formatCurrency(e.target.value)`
   - Para: `formatCotacao4(e.target.value)`

6. **`parseCurrencyToNumber` não precisa mudar** — já funciona com qualquer número de decimais.

