

## Diagnóstico: Saldo divergente na Poupança com lote anterior

### Causa raiz

No resgate FIFO (linhas 288-303), quando um lote é **totalmente consumido**, o código subtrai apenas o `valorPrincipal` do `restante`:

```ts
restante -= lote.valorPrincipal;  // linha 293
```

Mas o lote já tem rendimento acumulado (aniversários creditados). O resgate deveria consumir o `valorAtual` (principal + rendimento), não apenas o principal.

**Exemplo com seus dados:**

- Lote 0: 11/01/2024, principal 15.000, com ~150 de rendimento acumulado até 22/03 → valorAtual ≈ 15.150
- Lote 1: 23/02/2024, principal 50.000
- Resgate 22/03/2024: 40.000

**Comportamento atual (errado):**
- Lote 0: `restante -= 15.000` (ignora os ~150 de rendimento) → restante = 25.000
- Lote 1: parcial, principal passa a 25.000
- Os 150 de rendimento do Lote 0 são **perdidos** (zerados)

**Comportamento Gorila (correto):**
- Lote 0: `restante -= 15.150` (consome valor total) → restante = 24.850
- Lote 1: parcial, principal passa a 25.150 (150 a mais)
- Esse excedente de ~150 continua rendendo nos meses seguintes, acumulando a diferença de ~114 que você vê em 02/01/2025

### Alteração

**Arquivo:** `src/lib/poupancaEngine.ts`, linhas 292-297

**Antes:**
```ts
if (restante >= lote.valorPrincipal - 0.01) {
  restante -= lote.valorPrincipal;
  lote.valorAtual = 0;
  lote.valorPrincipal = 0;
  lote.rendimentoAcumulado = 0;
  lote.status = "resgatado";
}
```

**Depois:**
```ts
if (restante >= lote.valorAtual - 0.01) {
  restante -= lote.valorAtual;
  lote.valorAtual = 0;
  lote.valorPrincipal = 0;
  lote.rendimentoAcumulado = 0;
  lote.status = "resgatado";
} else if (restante >= lote.valorPrincipal - 0.01) {
  // Resgate consome todo o principal mas não todo o valorAtual
  restante -= lote.valorPrincipal;
  lote.valorPrincipal = 0;
  lote.valorAtual = lote.rendimentoAcumulado;
  // Lote continua ativo apenas com rendimento residual
  restante = 0;
  frontierLote = lote;
}
```

A condição parcial existente (linhas 298-303) permanece inalterada para o caso `restante < valorPrincipal`.

### O que NÃO muda
- Carteiras consolidadas
- `carteiraRendaFixaEngine.ts`
- Nenhum outro engine ou página
- Resgate parcial (restante < valorPrincipal) — já corrigido anteriormente

