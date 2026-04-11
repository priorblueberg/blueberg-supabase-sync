

# Phase 1: Supabase Connection + Validation

## What will be done

### Step 1: Install dependency
- Add `@supabase/supabase-js@^2.99.0` to the project

### Step 2: Create integration files (exact copies from reference)

**`src/integrations/supabase/client.ts`** — Same as reference but with fallback defaults for this environment:
```ts
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? "https://rrmktaabcurmehojmyoo.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "sb_publishable_xBmo1TAndEhpliEHu5Ok-A_QkS2ZiPE";
```

**`src/integrations/supabase/types.ts`** — Exact copy (837 lines, no changes)

### Step 3: Run validation script
A temporary script (`/tmp/validate.ts`) that:

1. **Reference data counts** — `SELECT count(*)` on all 10 historical/reference tables
2. **Write permission tests** — INSERT a test row with identifiable marker (`_BLUEBERG_VALIDATION_TEST_`), then DELETE it, on: `movimentacoes`, `custodia`, `controle_de_carteiras`, `poupanca_lotes`
3. **RPC test** — Call `check_email_exists` with a test email
4. **Report** — Print all results in a structured table

All test data will be cleaned up immediately after each write test. Results will be presented before any further implementation.

### What this does NOT do
- No pages, components, hooks, or engines copied yet
- No logic changes
- No table creation or schema modification

