

## Fix: Change poupança resgate order from FIFO to LIFO

### Root cause

The R$ 1,000 resgate on 02/01/2025 is being consumed from the **oldest** lot (dia 23, FIFO) but Gorila consumes from the **newest** lot (dia 27, LIFO). This shifts the balance between lots, causing all subsequent rendimentos to diverge:
- Dia 23: Blueberg lower (158.02 vs 164.45) because its base was reduced
- Dia 27: Blueberg higher (128.59 vs 122.42) because its base was untouched

### Change

**File:** `src/lib/poupancaEngine.ts`, line 285

Change the sort order of active lots for resgate processing from ascending (FIFO) to **descending** (LIFO):

```ts
// Before:
const sortedActive = [...activeLotes].sort((a, b) => a.dataAplicacao.localeCompare(b.dataAplicacao));

// After:
const sortedActive = [...activeLotes].sort((a, b) => b.dataAplicacao.localeCompare(a.dataAplicacao));
```

Also update the comments on lines 279-282 to reflect LIFO instead of FIFO.

The `resgatarPoupancaFIFO` export function (lines 390+) should also be updated to LIFO for consistency, along with its name.

### What stays the same
- Rendimento calculation logic
- Anniversary date logic
- All other engines and pages
- Proventos page (not touched)

