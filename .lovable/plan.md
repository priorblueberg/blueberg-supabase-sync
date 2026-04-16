

## Fix: Clear all caches on logout

### Problem
When switching users, pages retain cached data from the previous user (dataCache, engineCache, page-level caches, and React Query cache), showing stale/incorrect information.

### Root cause
The `signOut` function in `useAuth.tsx` only calls `supabase.auth.signOut()` without clearing any application caches. The `resetAllAppCaches()` function exists but is only used in the settings page reset flow.

### Changes

**1. `src/hooks/useAuth.tsx`** — Clear all caches on sign out

Import `resetAllAppCaches` and call it inside `signOut`. Also clear React Query cache by accepting a `queryClient` reference or by importing it.

Since `queryClient` is created in `App.tsx` and not easily accessible from the hook, the cleanest approach is to:
- Export `queryClient` from `App.tsx`
- In `signOut`, call `resetAllAppCaches()` and `queryClient.clear()` before `supabase.auth.signOut()`

**2. `src/App.tsx`** — Export `queryClient`

Add `export` to `const queryClient = new QueryClient()`.

### What stays the same
- All engine logic, page components, and cache structure unchanged
- `resetAllAppCaches` function unchanged
- Auth state clearing (already handled by `clearAuthState` on auth change event)

