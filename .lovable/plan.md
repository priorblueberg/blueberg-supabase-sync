

## Add anniversary interest payments to Poupança detail dialog

### What changes

When the detail dialog opens for a Poupança asset (identified by `modalidade === "Poupança"`), it will also display "Pagamento de Juros" rows on anniversary dates, interleaved chronologically with the existing movimentações.

### How

**1. Extend `PosicaoDetalheData` interface** (`src/components/PosicaoDetalheDialog.tsx`)
- Add `modalidade` field (already available from `getDetalheData`)

**2. Extend `PosicaoDetalheDialog` Props** 
- Accept an optional `jurosAniversario` array: `{ data: string; valor: number }[]`
- These are pre-computed anniversary payment entries

**3. Compute anniversary payments in `PosicaoConsolidadaPage.tsx`**
- When opening the detail dialog for a Poupança product, run `calcularPoupancaDiario` (or use cached results) to get daily rows
- Filter rows where `ganhoDiario > 0` — these are the anniversary dates
- Pass them as `jurosAniversario` prop to the dialog

**4. Merge and display in the dialog**
- In `fetchMovs`, after loading DB movimentações, merge the `jurosAniversario` entries as synthetic `Movimentacao` rows with:
  - `tipo_movimentacao: "Pagamento de Juros"`
  - `origem: "automatico"`
  - `valor: <ganhoDiario value>`
  - No edit/delete actions (read-only, like auto rows)
- Sort all entries by date
- Display with a distinct badge (e.g., "Juros" or "Auto")

### Files modified
- `src/components/PosicaoDetalheDialog.tsx` — add `modalidade` to data interface, accept and merge juros rows
- `src/pages/PosicaoConsolidadaPage.tsx` — compute and pass juros data when opening dialog for Poupança

### What stays the same
- Non-Poupança assets show the same dialog as today
- No changes to poupancaEngine, proventos page, or any other engine

