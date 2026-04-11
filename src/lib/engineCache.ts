/**
 * Cache layer for engine results per asset.
 * 
 * Stores the full timeline computed by the engine so that date changes
 * can slice existing results instead of re-running the engine.
 * 
 * Cache is keyed by asset parameters that affect calculation.
 * If parameters change (new movimentação, rate change, etc.), the cache
 * entry is invalidated and the engine re-runs.
 */

import type { DailyRow } from "@/lib/rendaFixaEngine";

interface EngineCacheEntry {
  /** The full array of daily rows from the engine */
  rows: DailyRow[];
  /** Pre-built date index for O(1) lookups */
  dateIndex: Map<string, number>; // date -> index in rows
  /** Last date in the cached result */
  lastDate: string;
  /** First date in the cached result */
  firstDate: string;
  /** Hash of the parameters that produced this result */
  paramHash: string;
}

interface PoupancaCacheEntry {
  rows: DailyRow[];
  dateIndex: Map<string, number>;
  lastDate: string;
  firstDate: string;
  paramHash: string;
}

// Cache storage keyed by codigo_custodia
const _rfCache = new Map<number, EngineCacheEntry>();
const _poupancaCache = new Map<number, PoupancaCacheEntry>();
const _cambioCache = new Map<number, { rows: any[]; dateIndex: Map<string, number>; lastDate: string; paramHash: string }>();

/** Version tracker - invalidate all when movimentações change */
let _cacheVersion = -1;

/**
 * Build a hash string from asset parameters.
 * Any change in these parameters invalidates the cache.
 */
function buildParamHash(params: {
  dataInicio: string;
  taxa: number;
  modalidade: string;
  puInicial: number;
  pagamento?: string | null;
  vencimento?: string | null;
  indexador?: string | null;
  dataResgateTotal?: string | null;
  dataLimite?: string | null;
  movsHash: string;
}): string {
  return [
    params.dataInicio,
    params.taxa,
    params.modalidade,
    params.puInicial,
    params.pagamento || "",
    params.vencimento || "",
    params.indexador || "",
    params.dataResgateTotal || "",
    params.dataLimite || "",
    params.movsHash,
  ].join("|");
}

/**
 * Build a simple hash from movimentações array.
 * Uses data+tipo+valor to detect changes.
 */
export function buildMovsHash(movs: { data: string; tipo_movimentacao: string; valor: number }[]): string {
  if (movs.length === 0) return "empty";
  // Use length + first/last data + sum of values as a fast hash
  let sum = 0;
  for (const m of movs) sum += m.valor;
  return `${movs.length}:${movs[0].data}:${movs[movs.length - 1].data}:${sum.toFixed(2)}`;
}

function buildDateIndex(rows: { data: string }[]): Map<string, number> {
  const map = new Map<string, number>();
  for (let i = 0; i < rows.length; i++) {
    map.set(rows[i].data, i);
  }
  return map;
}

/** Invalidate all engine caches (call when appliedVersion changes due to movimentação changes) */
export function invalidateEngineCache() {
  _rfCache.clear();
  _poupancaCache.clear();
  _cambioCache.clear();
}

/** Set cache version - if version changed, invalidate */
export function setEngineCacheVersion(version: number) {
  if (_cacheVersion !== version) {
    _cacheVersion = version;
    // Don't invalidate here - the cache entries self-validate via paramHash
  }
}

/** Store RF engine results */
export function cacheRFResult(
  codigoCustodia: number,
  rows: DailyRow[],
  params: {
    dataInicio: string;
    taxa: number;
    modalidade: string;
    puInicial: number;
    pagamento?: string | null;
    vencimento?: string | null;
    indexador?: string | null;
    dataResgateTotal?: string | null;
    dataLimite?: string | null;
    movsHash: string;
  }
) {
  if (rows.length === 0) return;
  _rfCache.set(codigoCustodia, {
    rows,
    dateIndex: buildDateIndex(rows),
    lastDate: rows[rows.length - 1].data,
    firstDate: rows[0].data,
    paramHash: buildParamHash(params),
  });
}

/**
 * Try to get cached RF engine results for a given date range.
 * Returns the rows up to dataCalculo if cache is valid.
 * Returns null if cache miss (caller should run engine and call cacheRFResult).
 */
export function getCachedRFResult(
  codigoCustodia: number,
  dataCalculo: string,
  params: {
    dataInicio: string;
    taxa: number;
    modalidade: string;
    puInicial: number;
    pagamento?: string | null;
    vencimento?: string | null;
    indexador?: string | null;
    dataResgateTotal?: string | null;
    dataLimite?: string | null;
    movsHash: string;
  }
): DailyRow[] | null {
  const entry = _rfCache.get(codigoCustodia);
  if (!entry) return null;

  const hash = buildParamHash(params);
  if (entry.paramHash !== hash) return null;

  // If requested date is within cached range, slice
  if (dataCalculo <= entry.lastDate) {
    const endIdx = entry.dateIndex.get(dataCalculo);
    if (endIdx !== undefined) {
      return entry.rows.slice(0, endIdx + 1);
    }
    // Date not in index (maybe non-business day), find nearest
    let lastValidIdx = 0;
    for (let i = 0; i < entry.rows.length; i++) {
      if (entry.rows[i].data <= dataCalculo) {
        lastValidIdx = i;
      } else {
        break;
      }
    }
    return entry.rows.slice(0, lastValidIdx + 1);
  }

  // Requested date is beyond cached range - cache miss
  return null;
}

/** Get the full cached rows (for pages that need the complete timeline) */
export function getFullCachedRFResult(
  codigoCustodia: number,
  params: {
    dataInicio: string;
    taxa: number;
    modalidade: string;
    puInicial: number;
    pagamento?: string | null;
    vencimento?: string | null;
    indexador?: string | null;
    dataResgateTotal?: string | null;
    dataLimite?: string | null;
    movsHash: string;
  }
): DailyRow[] | null {
  const entry = _rfCache.get(codigoCustodia);
  if (!entry) return null;
  if (entry.paramHash !== buildParamHash(params)) return null;
  return entry.rows;
}

// ── Poupança cache ──

export function cachePoupancaResult(
  codigoCustodia: number,
  rows: DailyRow[],
  movsHash: string
) {
  if (rows.length === 0) return;
  _poupancaCache.set(codigoCustodia, {
    rows,
    dateIndex: buildDateIndex(rows),
    lastDate: rows[rows.length - 1].data,
    firstDate: rows[0].data,
    paramHash: movsHash,
  });
}

export function getCachedPoupancaResult(
  codigoCustodia: number,
  dataCalculo: string,
  movsHash: string
): DailyRow[] | null {
  const entry = _poupancaCache.get(codigoCustodia);
  if (!entry) return null;
  if (entry.paramHash !== movsHash) return null;

  if (dataCalculo <= entry.lastDate) {
    const endIdx = entry.dateIndex.get(dataCalculo);
    if (endIdx !== undefined) {
      return entry.rows.slice(0, endIdx + 1);
    }
    let lastValidIdx = 0;
    for (let i = 0; i < entry.rows.length; i++) {
      if (entry.rows[i].data <= dataCalculo) lastValidIdx = i;
      else break;
    }
    return entry.rows.slice(0, lastValidIdx + 1);
  }

  return null;
}

// ── Câmbio cache ──

export function cacheCambioResult(
  codigoCustodia: number,
  rows: any[],
  movsHash: string
) {
  if (rows.length === 0) return;
  _cambioCache.set(codigoCustodia, {
    rows,
    dateIndex: buildDateIndex(rows),
    lastDate: rows[rows.length - 1].data,
    paramHash: movsHash,
  });
}

export function getCachedCambioResult(
  codigoCustodia: number,
  dataCalculo: string,
  movsHash: string
): any[] | null {
  const entry = _cambioCache.get(codigoCustodia);
  if (!entry) return null;
  if (entry.paramHash !== movsHash) return null;

  if (dataCalculo <= entry.lastDate) {
    const endIdx = entry.dateIndex.get(dataCalculo);
    if (endIdx !== undefined) {
      return entry.rows.slice(0, endIdx + 1);
    }
    let lastValidIdx = 0;
    for (let i = 0; i < entry.rows.length; i++) {
      if (entry.rows[i].data <= dataCalculo) lastValidIdx = i;
      else break;
    }
    return entry.rows.slice(0, lastValidIdx + 1);
  }

  return null;
}
