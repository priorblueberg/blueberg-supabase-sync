
## Diagnóstico real

O problema não está mais no filtro de `ProventosRecebidosPage.tsx`.

Evidências já visíveis no código e nos logs:
- o título `10011111` está entrando no processamento de Proventos (`engine RF cod=10011111`);
- a página só lista linhas com `row.pagamentoJuros > 0.01`;
- o `syncEngine` já gerou um `Resgate no Vencimento` de `R$ 8.242,85`, então o valor econômico final existe;
- em `src/lib/rendaFixaEngine.ts`, a regra atual zera `jurosPago` no vencimento quando `pagamento === "No Vencimento"`:

```ts
if (isFinalDay && pagamento !== "No Vencimento") {
  jurosPago = apoioCupom - tempBaseEconomica;
} else if (isPagamento) {
  jurosPago = apoioCupom - tempBaseEconomica;
} else {
  jurosPago = 0;
}
```

Ou seja: no vencimento de um título “No Vencimento”, o engine calcula o resgate total, mas não separa a parcela de juros. Como `/proventos` depende de `pagamentoJuros`, nada é listado.

Há ainda uma confirmação extra: `src/components/CalculadoraTable.tsx` já tem um workaround específico para recalcular os juros de `No Vencimento` na UI, o que mostra que o problema está na saída do engine.

## Plano de correção

**Arquivo principal:** `src/lib/rendaFixaEngine.ts`

1. **Corrigir a regra de juros no vencimento**
   - Tratar qualquer `isFinalDay` como evento de pagamento de juros, inclusive quando `pagamento === "No Vencimento"`.
   - No vencimento, usar a mesma base econômica já existente:
     - `jurosPago = apoioCupom - tempBaseEconomica`
   - Manter a proteção atual contra valor negativo.

2. **Fazer `pagamentoJuros` refletir esse valor**
   - Como `pagamentoJuros` recebe `jurosPago`, a correção fará a linha aparecer automaticamente em `/proventos`, sem precisar mudar a página.

3. **Preservar o total do resgate**
   - Manter a lógica do total pago no vencimento como:
     - `resgates + jurosPago`
   - Assim, o movimento automático continua totalizando `R$ 8.242,85`, mas com decomposição correta:
     - capital: `R$ 6.500,00`
     - juros: `R$ 1.742,85`

4. **Não alterar `ProventosRecebidosPage.tsx`**
   - A tela já está consumindo corretamente `row.pagamentoJuros > 0.01`.
   - A correção precisa ser no engine, não no filtro da página.

5. **Não mexer no workaround visual agora**
   - `CalculadoraTable.tsx` já tem proteção para esse cenário.
   - Para minimizar risco de regressão, a correção inicial fica só no engine.

## Impacto esperado
- O título `10011111` passará a gerar uma linha em `/proventos` na data `24/11/2025`.
- O valor listado deverá ser `R$ 1.742,85`.
- Títulos com pagamento periódico continuam funcionando como hoje.
- O fluxo atual de sincronização não é quebrado, porque o valor total do resgate no vencimento permanece o mesmo.

## Validação
- Reprocessar os dados e abrir `/proventos`.
- Confirmar que existe uma linha em `24/11/2025` para o título citado.
- Confirmar que o valor do provento é `R$ 1.742,85`.
- Confirmar que o movimento automático `Resgate no Vencimento` continua com valor total de `R$ 8.242,85`.
