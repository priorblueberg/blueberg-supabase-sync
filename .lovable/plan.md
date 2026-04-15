
## Diagnóstico

A divergência atual não parece mais ser de “aniversário perdido”. O problema mais provável agora está no FIFO após o resgate de 22/01/2025:

- o engine já consegue deixar um lote ativo com:
  - `valorPrincipal = 0`
  - `valorAtual > 0`
  - `rendimentoAcumulado > 0`
- isso acontece quando o resgate consome todo o principal, mas sobra rendimento no lote

Hoje, no loop de resgate de `src/lib/poupancaEngine.ts`, o lote é ignorado se:

```ts
if (lote.valorPrincipal <= 0.01) continue;
```

Ou seja: em resgates futuros, o engine não consome esses lotes “só com rendimento”, mesmo eles ainda tendo saldo econômico. O resultado é:

- lotes mais novos são consumidos antes da hora
- a base remanescente do aniversário de 23/01 fica menor do que no Gorila
- os pagamentos do dia 27 reaparecem, mas já sobre bases distorcidas

Isso explica bem o sintoma atual:
- nosso 23/01/2025 = 158,02
- Gorila = 164,45

## Plano de correção

1. Ajustar o FIFO da Poupança em `src/lib/poupancaEngine.ts`
   - trocar o critério de elegibilidade do lote no resgate:
   ```ts
   if (lote.valorAtual <= 0.01) continue;
   ```
   em vez de usar `valorPrincipal`
   - manter a ordem FIFO por data de aplicação
   - continuar consumindo pelo saldo econômico do lote (`valorAtual`)

2. Revisar os três cenários do loop de resgate
   - resgate cobre todo o lote: zera lote
   - resgate cobre todo o principal mas não todo o saldo: lote continua só com saldo remanescente
   - resgate parcial: reduz saldo corretamente sem mexer em aniversários

3. Alinhar a função auxiliar exportada `resgatarPoupancaFIFO`
   - ela ainda carrega lógica antiga e pode reintroduzir divergência no futuro
   - se continuar exportada, deve refletir a mesma regra econômica do engine principal

4. Validar os cenários já reportados
   - saldo após inclusão da aplicação inicial anterior
   - resgate de 02/01/2025
   - pagamento de 23/01/2025
   - pagamentos do dia 27
   - confirmar que a Carteira Renda Fixa não é tocada

## Detalhes técnicos

**Arquivo principal:** `src/lib/poupancaEngine.ts`

**Ponto crítico atual:**
```ts
if (lote.valorPrincipal <= 0.01) continue;
```

**Ajuste esperado:**
```ts
if (lote.valorAtual <= 0.01) continue;
```

## O que não será alterado

- `carteiraRendaFixaEngine.ts`
- páginas de carteira
- página de Proventos
- engine de Moedas
- regra de aniversários já corrigida anteriormente
