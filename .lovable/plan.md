

## Bug: Pagamento trimestral aparecendo em 13/04/2026

### Causa raiz

O engine passa `effectiveEnd` (= `2026-12-31`, data do vencimento) como parâmetro `dataCalculo` para `gerarDatasPagamentoJuros`. Isso faz a funcao gerar datas de pagamento futuras como `2026-06-30`, `2026-09-30` e `2026-12-31`.

Porem, o calendario disponivel so vai ate `2026-04-13` (data de hoje). Quando `ajustarParaDiaUtil("2026-06-30")` e chamada, ela faz busca binaria no calendario e encontra `2026-04-13` como a data mais proxima. Como essa data e dia util, retorna `"2026-04-13"` como "dia util ajustado" para o pagamento de junho.

Resultado: `datasPagamento` contem `"2026-04-13"` indevidamente, e o engine calcula juros (R$ 71,78) nessa data.

### Correcao

**Arquivo:** `src/lib/rendaFixaEngine.ts`, linha 276

Trocar `effectiveEnd` por `endDate` na chamada a `gerarDatasPagamentoJuros`:

```ts
// Antes:
gerarDatasPagamentoJuros(dataInicio, vencimento, pagamento, calendario, effectiveEnd)

// Depois:
gerarDatasPagamentoJuros(dataInicio, vencimento, pagamento, calendario, endDate)
```

Isso garante que datas de pagamento so serao geradas ate a data de calculo real (`dataCalculo`), nao ate o vencimento futuro. Como o calendario nunca contem datas alem de `endDate`, a funcao `ajustarParaDiaUtil` sempre tera dados validos para trabalhar.

### Impacto
- O pagamento espurio em 13/04/2026 desaparece.
- Pagamentos passados ja processados (como 2026-03-31 trimestral) continuam corretos.
- Nenhum outro titulo e afetado, pois para titulos ja vencidos `endDate == effectiveEnd`.

