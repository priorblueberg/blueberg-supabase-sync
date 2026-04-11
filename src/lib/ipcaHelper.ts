/**
 * IPCA Helper — Anniversary-Cycle Methodology
 *
 * RULE: IPCA correction is applied per ANNIVERSARY CYCLE of the asset,
 * NOT by calendar month. The anniversary day comes from the asset's
 * maturity date (vencimento). Each cycle runs from lastAnniversary
 * to nextAnniversary, and the monthly IPCA factor is distributed
 * across the business days within that cycle.
 *
 * LOOK-AHEAD BIAS: Official IPCA data is only used if its
 * data_publicacao <= calcDate. Otherwise, projections are used.
 */
import { supabase } from "@/integrations/supabase/client";

// ─── Types ───────────────────────────────────────────────────────────

export interface IpcaRecord {
  competencia: string;
  fator_mensal: number;
  data_publicacao?: string | null;
}

export interface IpcaProjecaoRecord {
  competencia: string;
  fator_projetado: number;
}

interface CalEntry {
  data: string;
  dia_util: boolean;
}

// ─── Anniversary helpers ─────────────────────────────────────────────

/**
 * Returns the day-of-month from the maturity date.
 * E.g. vencimento "2025-12-30" → 30
 */
export function getAnniversaryDay(vencimento: string): number {
  const d = new Date(vencimento + "T12:00:00");
  return d.getUTCDate();
}

/**
 * Clamps a target day to the last valid day of the given month.
 * E.g. day 31 in February → 28 or 29.
 */
function clampDay(year: number, month: number, targetDay: number): number {
  const lastDay = new Date(year, month + 1, 0).getDate();
  return Math.min(targetDay, lastDay);
}

function toIso(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/**
 * For a given calcDate and anniversaryDay, returns:
 * - lastAnniversary: the most recent anniversary date <= calcDate
 * - nextAnniversary: the next anniversary date > calcDate
 * - competencia: "YYYY-MM-01" of the month whose IPCA applies to this cycle
 *
 * The competencia follows ANBIMA convention: it is the month PRIOR to
 * the lastAnniversary month (i.e. the IPCA that was measured for that
 * period and applies within this cycle).
 */
export function getAnniversaryBounds(
  calcDate: string,
  anniversaryDay: number
): { lastAnniversary: string; nextAnniversary: string; competencia: string } {
  const dt = new Date(calcDate + "T12:00:00");
  const y = dt.getUTCFullYear();
  const m = dt.getUTCMonth(); // 0-based
  const day = dt.getUTCDate();

  const clampedThisMonth = clampDay(y, m, anniversaryDay);

  let lastY: number, lastM: number, lastD: number;
  let nextY: number, nextM: number, nextD: number;

  if (day >= clampedThisMonth) {
    // Last anniversary is in the current month
    lastY = y; lastM = m; lastD = clampedThisMonth;
    // Next anniversary is next month
    if (m === 11) { nextY = y + 1; nextM = 0; } else { nextY = y; nextM = m + 1; }
    nextD = clampDay(nextY, nextM, anniversaryDay);
  } else {
    // Last anniversary is in the previous month
    if (m === 0) { lastY = y - 1; lastM = 11; } else { lastY = y; lastM = m - 1; }
    lastD = clampDay(lastY, lastM, anniversaryDay);
    // Next anniversary is in the current month
    nextY = y; nextM = m; nextD = clampedThisMonth;
  }

  const lastAnniversary = toIso(lastY, lastM, lastD);
  const nextAnniversary = toIso(nextY, nextM, nextD);

  // Competencia: the month PRIOR to the lastAnniversary month.
  // ANBIMA convention: the IPCA measured during month X is published around
  // the 15th of month X+1. For the cycle starting at anniversary in month M,
  // the applicable IPCA is from month M-1 (published ~15th of M, hence available).
  let compY = lastY;
  let compM = lastM - 1; // 0-based, go to prior month
  if (compM < 0) { compM = 11; compY -= 1; }
  const competencia = `${compY}-${String(compM + 1).padStart(2, "0")}-01`;

  return { lastAnniversary, nextAnniversary, competencia };
}

// ─── Factor selection (no look-ahead bias) ───────────────────────────

/**
 * Selects the IPCA factor for a given competencia, respecting the
 * look-ahead bias rule: official data is used ONLY if its
 * data_publicacao <= calcDate. Otherwise, projection is used.
 * Fallback: 1.0 (no correction).
 */
export function selectIpcaFactor(
  competencia: string,
  calcDate: string,
  oficialRecords: IpcaRecord[],
  projecaoRecords: IpcaProjecaoRecord[]
): number {
  // Try official first
  const oficial = oficialRecords.find(
    (r) => r.competencia.substring(0, 7) === competencia.substring(0, 7)
  );
  if (oficial && oficial.data_publicacao && oficial.data_publicacao <= calcDate) {
    return oficial.fator_mensal;
  }

  // Fall back to projection
  const proj = projecaoRecords.find(
    (r) => r.competencia.substring(0, 7) === competencia.substring(0, 7)
  );
  if (proj) {
    return proj.fator_projetado;
  }

  // If no projection either, use official anyway (better than nothing for very old dates)
  if (oficial) {
    return oficial.fator_mensal;
  }

  return 1.0;
}

// ─── Helpers for stub detection ──────────────────────────────────────

/**
 * Returns the number of calendar days between two ISO date strings (exclusive start, inclusive end).
 */
function calendarDaysBetween(startIso: string, endIso: string): number {
  const s = new Date(startIso + "T12:00:00");
  const e = new Date(endIso + "T12:00:00");
  return Math.round((e.getTime() - s.getTime()) / 86400000);
}

/**
 * Returns the first anniversary date strictly after `dataInicio`.
 */
function getFirstAnniversaryAfter(dataInicio: string, anniversaryDay: number): string {
  const dt = new Date(dataInicio + "T12:00:00");
  let y = dt.getUTCFullYear();
  let m = dt.getUTCMonth();
  const day = dt.getUTCDate();

  const clampedThisMonth = clampDay(y, m, anniversaryDay);
  if (clampedThisMonth > day) {
    // First anniversary is later this month
    return toIso(y, m, clampDay(y, m, anniversaryDay));
  }
  // Next month
  if (m === 11) { y += 1; m = 0; } else { m += 1; }
  return toIso(y, m, clampDay(y, m, anniversaryDay));
}

// ─── Cycle-based daily factor map ──────────────────────────────────

/**
 * Builds a Map<date, dailyIpcaFactor> for BUSINESS DAYS in [dataInicio, dataCalculo].
 *
 * For CDB/LC/LCI/LCA/LF/LFS/LIG IPCA products, the anniversary day is
 * overridden to 15 (ANBIMA IPCA reference date). The IPCA factor for each
 * cycle is distributed across the BUSINESS DAYS within that cycle.
 *
 * dailyFactor = POWER(fatorCiclo, 1 / businessDaysInCycle)
 *
 * The optional `overrideAnnDay` parameter allows using a fixed anniversary
 * day (e.g. 15 for CDB IPCA) instead of the vencimento day.
 */
export function buildIpcaCycleDailyFactorMap(
  dataInicio: string,
  dataCalculo: string,
  vencimento: string,
  calendario: CalEntry[],
  oficialRecords: IpcaRecord[],
  projecaoRecords: IpcaProjecaoRecord[],
  overrideAnnDay?: number
): Map<string, number> {
  const annDay = overrideAnnDay ?? getAnniversaryDay(vencimento);
  const result = new Map<string, number>();

  const sortedCal = [...calendario].sort((a, b) => a.data.localeCompare(b.data));

  // Pre-build set of business days for counting within cycles
  const bizDaysSet = new Set<string>();
  for (const cal of sortedCal) {
    if (cal.dia_util) bizDaysSet.add(cal.data);
  }

  const cycleCache = new Map<string, { factor: number; divisor: number }>();

  for (const cal of sortedCal) {
    if (cal.data < dataInicio || cal.data > dataCalculo) continue;
    if (!cal.dia_util) continue; // Only emit factors for business days

    const bounds = getAnniversaryBounds(cal.data, annDay);
    const cacheKey = bounds.lastAnniversary;

    let cycleInfo = cycleCache.get(cacheKey);
    if (!cycleInfo) {
      // Count business days in the cycle (lastAnniversary, nextAnniversary]
      let bizDaysInCycle = 0;
      const lastAnn = bounds.lastAnniversary;
      const nextAnn = bounds.nextAnniversary;
      for (const d of bizDaysSet) {
        if (d > lastAnn && d <= nextAnn) bizDaysInCycle++;
      }
      if (bizDaysInCycle === 0) bizDaysInCycle = 1;

      const factor = selectIpcaFactor(
        bounds.competencia,
        cal.data,
        oficialRecords,
        projecaoRecords
      );

      cycleInfo = { factor, divisor: bizDaysInCycle };
      cycleCache.set(cacheKey, cycleInfo);
    }

    const dailyFactor = Math.pow(cycleInfo.factor, 1 / cycleInfo.divisor);
    result.set(cal.data, dailyFactor);
  }

  return result;
}

// ─── CDB IPCA: Accumulated + Pro-rata projection (calendar-month) ───

/**
 * For CDB/LC/LCI/LCA/LF/LFS/LIG IPCA products, the IPCA component is:
 *
 *   fatorInflacao = (produto de todos os fatores mensais oficiais fechados)
 *                 × (1 + IPCA_projecao_mes_corrente)^(DU_decorridos / DU_totais_do_mes)
 *
 * The daily multiplier returned is the INCREMENTAL factor for each business day:
 *   on business days: the factor that, when compounded, builds the accumulated inflation
 *   on non-business days: 1.0 (no accrual)
 *
 * Returns Map<date, dailyIpcaMult> where dailyIpcaMult is the inflation
 * component of the daily multiplier (to be combined with taxa real by the engine).
 */
export function buildIpcaCdbDailyMultMap(
  dataInicio: string,
  dataCalculo: string,
  calendario: CalEntry[],
  oficialRecords: IpcaRecord[],
  projecaoRecords: IpcaProjecaoRecord[]
): Map<string, number> {
  const result = new Map<string, number>();

  const sortedCal = [...calendario].sort((a, b) => a.data.localeCompare(b.data));

  // Pre-build: for each month "YYYY-MM", count total business days and list them
  const monthBizDays = new Map<string, string[]>();
  for (const cal of sortedCal) {
    if (!cal.dia_util) continue;
    const mk = cal.data.substring(0, 7);
    const arr = monthBizDays.get(mk) || [];
    arr.push(cal.data);
    monthBizDays.set(mk, arr);
  }

  // Build oficial map: competencia "YYYY-MM" → fator_mensal
  const oficialMap = new Map<string, { fator: number; pubDate: string | null }>();
  for (const r of oficialRecords) {
    oficialMap.set(r.competencia.substring(0, 7), {
      fator: r.fator_mensal,
      pubDate: r.data_publicacao || null,
    });
  }

  // Build projecao map: competencia "YYYY-MM" → fator_projetado
  const projecaoMap = new Map<string, number>();
  for (const r of projecaoRecords) {
    projecaoMap.set(r.competencia.substring(0, 7), r.fator_projetado);
  }

  // For each calendar day in range, compute the accumulated IPCA factor
  // Then derive the daily increment.
  let prevAccumulatedFactor = 1.0;

  for (const cal of sortedCal) {
    if (cal.data < dataInicio || cal.data > dataCalculo) continue;

    if (!cal.dia_util) {
      // Non-business day: no IPCA accrual, mult = 1
      result.set(cal.data, 1.0);
      continue;
    }

    const calcDate = cal.data;
    const calcMonth = calcDate.substring(0, 7); // "YYYY-MM"

    // 1. Accumulate all CLOSED official months from the month BEFORE dataInicio
    // up to (but not including) current month.
    // IPCAt-1 starts from the month prior to emission per CDB IPCA methodology.
    // Only count months whose data_publicacao <= calcDate (no look-ahead)
    let accFatorFechado = 1.0;

    // Start from the month BEFORE dataInicio (IPCAt-1)
    const startDate = new Date(dataInicio + "T12:00:00");
    startDate.setUTCMonth(startDate.getUTCMonth() - 1);
    const startMonth = `${startDate.getUTCFullYear()}-${String(startDate.getUTCMonth() + 1).padStart(2, "0")}`;

    // Iterate months from startMonth to the month BEFORE calcMonth
    let cursor = startMonth;
    while (cursor < calcMonth) {
      const ofRec = oficialMap.get(cursor);
      if (ofRec && ofRec.pubDate && ofRec.pubDate <= calcDate) {
        accFatorFechado *= ofRec.fator;
      } else {
        // Official not yet published for this date — use projection
        const proj = projecaoMap.get(cursor);
        if (proj) {
          accFatorFechado *= proj;
        }
        // If neither, treat as 1.0 (no data)
      }
      // Advance cursor to next month
      const [cy, cm] = cursor.split("-").map(Number);
      const nextM = cm === 12 ? 1 : cm + 1;
      const nextY = cm === 12 ? cy + 1 : cy;
      cursor = `${nextY}-${String(nextM).padStart(2, "0")}`;
    }

    // 2. Pro-rata projection for the CURRENT month
    const currentMonthBiz = monthBizDays.get(calcMonth) || [];
    const duTotal = currentMonthBiz.length;
    // Count business days elapsed in the current month up to and including calcDate
    let duDecorridos = 0;
    for (const d of currentMonthBiz) {
      if (d <= calcDate) duDecorridos++;
    }

    // Get the IPCA factor for the current month
    let fatorMesCorrente: number;
    const ofCurrent = oficialMap.get(calcMonth);
    if (ofCurrent && ofCurrent.pubDate && ofCurrent.pubDate <= calcDate) {
      // Official already published — use it fully (pro-rata still applies since month isn't over in accrual terms)
      fatorMesCorrente = ofCurrent.fator;
    } else {
      // Use projection
      fatorMesCorrente = projecaoMap.get(calcMonth) ?? 1.0;
    }

    const proRataFator = duTotal > 0
      ? Math.pow(fatorMesCorrente, duDecorridos / duTotal)
      : 1.0;

    // 3. Total accumulated factor for this date
    const totalAccumulated = accFatorFechado * proRataFator;

    // 4. Daily increment = totalAccumulated / prevAccumulatedFactor
    const dailyMult = totalAccumulated / prevAccumulatedFactor;
    result.set(cal.data, dailyMult);

    prevAccumulatedFactor = totalAccumulated;
  }

  return result;
}

// ─── Data fetching ───────────────────────────────────────────────────

/**
 * Fetch IPCA data (official + projections) for a date range.
 * Returns undefined if indexador is not IPCA.
 * Includes data_publicacao for look-ahead bias control.
 */
export async function fetchIpcaRecords(
  indexador: string | null | undefined,
  dataInicio: string,
  dataFim: string
): Promise<{ oficial: IpcaRecord[]; projecao: IpcaProjecaoRecord[] } | undefined> {
  if (indexador !== "IPCA") return undefined;

  // Expand range by 2 months to cover anniversary cycle boundaries
  const start = new Date(dataInicio + "T12:00:00");
  start.setMonth(start.getMonth() - 2);
  const startMonth = start.toISOString().substring(0, 7) + "-01";
  
  const end = new Date(dataFim + "T12:00:00");
  end.setMonth(end.getMonth() + 2);
  const endMonth = end.toISOString().substring(0, 7) + "-01";

  const [oficialRes, projecaoRes] = await Promise.all([
    supabase
      .from("historico_ipca")
      .select("competencia, fator_mensal, data_publicacao")
      .gte("competencia", startMonth)
      .lte("competencia", endMonth)
      .order("competencia"),
    supabase
      .from("historico_ipca_projecao")
      .select("competencia, fator_projetado")
      .gte("competencia", startMonth)
      .lte("competencia", endMonth)
      .order("competencia"),
  ]);

  const oficial: IpcaRecord[] = (oficialRes.data || []).map((r: any) => ({
    competencia: r.competencia,
    fator_mensal: Number(r.fator_mensal),
    data_publicacao: r.data_publicacao || null,
  }));

  const projecao: IpcaProjecaoRecord[] = (projecaoRes.data || []).map((r: any) => ({
    competencia: r.competencia,
    fator_projetado: Number(r.fator_projetado),
  }));

  return oficial.length > 0 || projecao.length > 0
    ? { oficial, projecao }
    : undefined;
}

/**
 * Batch fetch IPCA records for multiple products.
 * Returns a single result covering the full date range if any product uses IPCA.
 */
export async function fetchIpcaRecordsBatch(
  products: { indexador?: string | null; data_inicio: string }[],
  dataFim: string
): Promise<{ oficial: IpcaRecord[]; projecao: IpcaProjecaoRecord[] } | undefined> {
  const hasIpca = products.some((p) => p.indexador === "IPCA");
  if (!hasIpca) return undefined;

  const minDate = products
    .filter((p) => p.indexador === "IPCA")
    .reduce((min, p) => (p.data_inicio < min ? p.data_inicio : min), "9999-12-31");

  return fetchIpcaRecords("IPCA", minDate, dataFim);
}
