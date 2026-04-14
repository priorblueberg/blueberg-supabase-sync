

## Correção: Incluir juros de títulos "No Vencimento" na página de Proventos

### Problema
Linha 74 de `ProventosRecebidosPage.tsx` filtra explicitamente `c.pagamento !== "No Vencimento"`, excluindo títulos com essa modalidade de pagamento. Porém, no dia do vencimento, o engine calcula `jurosPago > 0` para esses títulos tambem -- esse valor precisa aparecer como provento.

### Correção

**Arquivo:** `src/pages/ProventosRecebidosPage.tsx`

1. **Ampliar o filtro `withPayment` (linha 73-75):** Incluir todos os títulos de Renda Fixa que tenham `pagamento` preenchido (incluindo "No Vencimento"), em vez de excluir "No Vencimento". O filtro passa a ser:
   - `c.categorias?.nome === "Renda Fixa"` e `c.pagamento` preenchido (truthy)
   - Remove a condição `c.pagamento !== "No Vencimento"`

2. **Verificar `needsCdi` (linha 97-100):** Ja cobre todos os `withPayment`, entao naturalmente incluira os novos titulos CDI com "No Vencimento" (ex.: DPGE UBS 120% CDI). Sem alteracao necessaria.

3. **O loop de coleta (linhas 196-205):** Ja usa `row.pagamentoJuros > 0.01` para filtrar -- titulos "No Vencimento" so terao `pagamentoJuros > 0` no dia do vencimento, entao so essa linha aparecera. Sem alteracao necessaria.

### Impacto
- Titulos como "DPGE Banco de Investimentos UBS Pos Fixado 120% CDI - 24/11/2025" (No Vencimento) passarao a aparecer na lista de proventos com o juros pago no dia do vencimento.
- Nenhuma regra de calculo e alterada.

