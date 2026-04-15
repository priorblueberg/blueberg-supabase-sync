

## Fix: Resgate parcial da Poupança consome rendimento indevidamente

### Causa raiz

No resgate parcial FIFO (linhas 298-304 de `poupancaEngine.ts`), o código reduz `rendimentoAcumulado` proporcionalmente ao resgate. Isso elimina parte do rendimento já creditado.

Gorila trata o resgate como subtração simples do `valorAtual` total, consumindo primeiro o principal e preservando o rendimento acumulado.

### Alteração

**Arquivo:** `src/lib/poupancaEngine.ts`, linhas 298-304

**Antes:**
```ts
const proporcao = restante / lote.valorPrincipal;
lote.valorPrincipal -= restante;
lote.rendimentoAcumulado -= lote.rendimentoAcumulado * proporcao;
lote.valorAtual = lote.valorPrincipal + lote.rendimentoAcumulado;
restante = 0;
frontierLote = lote;
```

**Depois:**
```ts
lote.valorPrincipal -= restante;
lote.valorAtual = lote.valorPrincipal + lote.rendimentoAcumulado;
restante = 0;
frontierLote = lote;
```

Remove a linha que subtrai `rendimentoAcumulado * proporcao`. O rendimento já creditado no aniversário é preservado integralmente, e apenas o principal é consumido pelo resgate.

### O que NÃO muda
- Resgate total (lote inteiro) continua zerando tudo
- Nenhuma carteira consolidada
- Nenhum outro engine ou página
- `carteiraRendaFixaEngine.ts` intocado

