/**
 * Central function to invalidate ALL module-level caches in the app.
 * Call after data-destructive operations (e.g. reset movimentações).
 */
import { invalidateAllCaches } from "@/lib/dataCache";
import { invalidateEngineCache } from "@/lib/engineCache";

// Each page registers its own cache-reset callback here
const _resetCallbacks: (() => void)[] = [];

/** Pages call this at module init to register their cache-clearing function */
export function registerCacheReset(fn: () => void) {
  _resetCallbacks.push(fn);
}

/** Nuke every cache in the app */
export function resetAllAppCaches() {
  invalidateAllCaches();
  invalidateEngineCache();
  for (const fn of _resetCallbacks) {
    try { fn(); } catch { /* ignore */ }
  }
}
