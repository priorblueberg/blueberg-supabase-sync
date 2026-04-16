

## Fix: Stale cache on user switch for MovimentacoesPage and CustodiaPage

### Root cause

`MovimentacoesPage` and `CustodiaPage` have module-level caches (`_movCachedVersion`/`_movCachedRows` and `_custCachedVersion`/`_custCachedRows`) but **never register** with `registerCacheReset()`. When a user logs out and another logs in, `resetAllAppCaches()` runs but these two caches are untouched — the old data is shown until `appliedVersion` changes.

### Fix

Add `registerCacheReset` calls in both files, matching the pattern used by the other pages (PosicaoConsolidada, CarteiraRendaFixa, CarteiraInvestimentos, CarteiraCambio).

**`src/pages/MovimentacoesPage.tsx`** — after line 53:
```ts
import { registerCacheReset } from "@/lib/resetCaches";
registerCacheReset(() => { _movCachedVersion = null; _movCachedRows = []; });
```

**`src/pages/CustodiaPage.tsx`** — after line 69:
```ts
import { registerCacheReset } from "@/lib/resetCaches";
registerCacheReset(() => { _custCachedVersion = null; _custCachedRows = []; _custCachedCarteira = null; });
```

### What stays the same
- Cache structure, engine logic, auth flow, all other pages unchanged.

