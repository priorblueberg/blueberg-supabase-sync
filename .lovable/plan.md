

## Fix: Rendimento da Poupança deve usar saldo no início do ciclo, não saldo atual

### Diagnóstico

Na poupança, o rendimento de cada ciclo mensal é calculado sobre o **saldo que existia no início do ciclo** (data do último aniversário ou data de aplicação), não sobre o saldo no momento do crédito.

**O que acontece hoje no engine:**
1. 23/02: Aplicação 50.000 (valorAtual = 50.000)
2. 22/03: Resgate 40.000 → valorAtual cai para 10.000
3. 23/03: Aniversário → rendimento calculado sobre 10.000 → ~11,28

**O que o Gorila faz (correto):**
1. 23/02: Aplicação 50.000
2. 23/03: Aniversário → rendimento calculado sobre 50.000 (base do início do ciclo) → 56,38
3. O resgate no meio do ciclo não reduz a base de cálculo do rendimento daquele ciclo

### Causa raiz

Na função `calcRendimentoMensal` e no loop principal, o rendimento usa `lote.valorAtual` como base. Mas resgates feitos antes do aniversário já reduziram `valorAtual`, diminuindo indevidamente o rendimento do ciclo.

### Alteração proposta

**Arquivo:** `src/lib/poupancaEngine.ts`

**1. Adicionar campo `valorInicialCiclo` ao `LoteState`:**
Cada lote guarda o valor que tinha no início do ciclo atual (no último aniversário ou na aplicação). Esse valor não é afetado por resgates mid-cycle.

**2. No cálculo do rendimento (aniversário), usar `valorInicialCiclo` em vez de `valorAtual`:**
```ts
// ANTES:
const rendBruto = lote.valorAtual * (serie195 / 100);

// DEPOIS:
const rendBruto = lote.valorInicialCiclo * (serie195 / 100);
```

**3. Após creditar o rendimento, atualizar `valorInicialCiclo`:**
```ts
lote.valorInicialCiclo = lote.valorAtual; // novo ciclo começa com saldo atualizado
```

**4. Inicializar `valorInicialCiclo` com `valorPrincipal` na criação do lote.**

### O que NÃO muda
- Nenhuma carteira consolidada
- `carteiraRendaFixaEngine.ts`
- Nenhum outro engine ou página
- Lógica FIFO de resgate (continua consumindo valorPrincipal/valorAtual normalmente)
- `ganhoDiario` e `ganhoAcumulado` em R$ continuam coerentes

