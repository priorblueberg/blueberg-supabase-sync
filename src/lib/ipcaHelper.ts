/**
 * IPCA Helper — fonte única: tabela `calendario_ipca`.
 *
 * Esta versão substitui o uso das tabelas legadas `historico_ipca` e
 * `historico_ipca_projecao`. Toda decisão sobre Oficial vs Projetada
 * agora vem da `calendario_ipca` (colunas: data, tipo, competencia,
 * variacao_mensal).
 *
 * Conceito de `calendario_ipca`:
 *  - tipo = 'Oficial':   `data` é a data de divulgação oficial
 *                         (= "data_divulgacao_oficial"), `competencia`
 *                         é o mês de referência do índice.
 *  - tipo = 'Projetada': `data` é a data em que aquela projeção valeu
 *                         (não usada na decisão atual), `competencia`
 *                         é o mês projetado.
 *
 * Conversão de variação para fator: fator = 1 + variacao_mensal/100.
 *
 * Sem look-ahead: Oficial só é usada se `data_linha >= data_divulgacao_oficial`.
 *
 * Status A1–A7 (regras para `dia_aplicacao ≠ dia_vencimento`):
 *   ⚠ NÃO IMPLEMENTADAS. Usa-se um fallback temporário documentado em
 *   `selectTipoTaxaInicial` até que a especificação seja entregue.
 */
import { supabase } from "@/integrations/supabase/client";

// ─── Types ───────────────────────────────────────────────────────────

export type IpcaTipo = "Oficial" | "Projetada";

export interface CalendarioIpcaRecord {
  /** Para Oficial: data de divulgação. Para Projetada: data de referência. */
  data: string;
  tipo: IpcaTipo;
  /** Mês de competência no formato "YYYY-MM-01". */
  competencia: string;
  /** Variação mensal em %. Ex.: 0.45 para 0,45%. */
  variacao_mensal: number;
}

interface CalEntry {
  data: string;
  dia_util: boolean;
}

// ─── Anniversary helpers ─────────────────────────────────────────────

export function getAnniversaryDay(vencimento: string): number {
  const d = new Date(vencimento + "T12:00:00");
  return d.getUTCDate();
}

function clampDay(year: number, month: number, targetDay: number): number {
  const lastDay = new Date(year, month + 1, 0).getDate();
  return Math.min(targetDay, lastDay);
}

function toIso(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/**
 * Para uma data e dia de aniversário, devolve as bordas do ciclo e a
 * competência IPCA aplicável (mês anterior ao último aniversário —
 * convenção ANBIMA).
 */
export function getAnniversaryBounds(
  calcDate: string,
  anniversaryDay: number
): { lastAnniversary: string; nextAnniversary: string; competencia: string } {
  const dt = new Date(calcDate + "T12:00:00");
  const y = dt.getUTCFullYear();
  const m = dt.getUTCMonth();
  const day = dt.getUTCDate();

  const clampedThisMonth = clampDay(y, m, anniversaryDay);

  let lastY: number, lastM: number, lastD: number;
  let nextY: number, nextM: number, nextD: number;

  if (day >= clampedThisMonth) {
    lastY = y; lastM = m; lastD = clampedThisMonth;
    if (m === 11) { nextY = y + 1; nextM = 0; } else { nextY = y; nextM = m + 1; }
    nextD = clampDay(nextY, nextM, anniversaryDay);
  } else {
    if (m === 0) { lastY = y - 1; lastM = 11; } else { lastY = y; lastM = m - 1; }
    lastD = clampDay(lastY, lastM, anniversaryDay);
    nextY = y; nextM = m; nextD = clampedThisMonth;
  }

  const lastAnniversary = toIso(lastY, lastM, lastD);
  const nextAnniversary = toIso(nextY, nextM, nextD);

  let compY = lastY;
  let compM = lastM - 1;
  if (compM < 0) { compM = 11; compY -= 1; }
  const competencia = `${compY}-${String(compM + 1).padStart(2, "0")}-01`;

  return { lastAnniversary, nextAnniversary, competencia };
}

// ─── JanelaTeorica (item 4 do enunciado) ─────────────────────────────

/**
 * Computa a "JanelaTeorica" para o casal (dataAplicacao, vencimento):
 *  - Se `dia_aplicacao = dia_vencimento`: a janela é o próprio mês de
 *    aplicação no dia do vencimento (clamp ao último dia válido).
 *  - Se `dia_aplicacao > dia_vencimento`: janela é dia_vencimento do
 *    mês seguinte.
 *  - Se `dia_aplicacao < dia_vencimento`: janela é dia_vencimento do
 *    mesmo mês da aplicação.
 *
 * Retorna ISO date.
 */
export function computeJanelaTeorica(dataAplicacao: string, vencimento: string): string {
  const ap = new Date(dataAplicacao + "T12:00:00");
  const vc = new Date(vencimento + "T12:00:00");
  const apY = ap.getUTCFullYear();
  const apM = ap.getUTCMonth();
  const apDay = ap.getUTCDate();
  const vcDay = vc.getUTCDate();

  let y = apY, m = apM;
  if (apDay > vcDay) {
    if (m === 11) { y += 1; m = 0; } else { m += 1; }
  }
  const day = clampDay(y, m, vcDay);
  return toIso(y, m, day);
}

// ─── Indexação dos registros ─────────────────────────────────────────

interface IpcaIndex {
  /** competencia "YYYY-MM" → registro Oficial mais recente (se houver) */
  oficial: Map<string, CalendarioIpcaRecord>;
  /** competencia "YYYY-MM" → registro Projetada mais recente (se houver) */
  projetada: Map<string, CalendarioIpcaRecord>;
}

function buildIpcaIndex(records: CalendarioIpcaRecord[]): IpcaIndex {
  const oficial = new Map<string, CalendarioIpcaRecord>();
  const projetada = new Map<string, CalendarioIpcaRecord>();
  for (const r of records) {
    const key = r.competencia.substring(0, 7);
    if (r.tipo === "Oficial") {
      const prev = oficial.get(key);
      if (!prev || r.data > prev.data) oficial.set(key, r);
    } else if (r.tipo === "Projetada") {
      const prev = projetada.get(key);
      if (!prev || r.data > prev.data) projetada.set(key, r);
    }
  }
  return { oficial, projetada };
}

function variacaoToFator(variacaoPct: number): number {
  return 1 + variacaoPct / 100;
}

// ─── Seleção Oficial vs Projetada (por dia) ──────────────────────────

interface TaxaResolvida {
  tipoTaxa: "IPCA" | "Projetada";
  fator: number;
}

/**
 * Resolve qual taxa usar para uma competência específica em uma dada
 * data de cálculo, sem look-ahead.
 * - Oficial se existir e `data_linha >= data_divulgacao_oficial`.
 * - Senão, Projetada (se existir).
 * - Fallback final: fator 1.0 (sem correção) — não deve ocorrer em
 *   produção, indica calendario_ipca incompleto.
 */
function resolverTaxaCompetencia(
  competencia: string,
  dataLinha: string,
  index: IpcaIndex
): TaxaResolvida {
  const key = competencia.substring(0, 7);
  const oficial = index.oficial.get(key);
  if (oficial && oficial.data <= dataLinha) {
    return { tipoTaxa: "IPCA", fator: variacaoToFator(oficial.variacao_mensal) };
  }
  const projetada = index.projetada.get(key);
  if (projetada) {
    return { tipoTaxa: "Projetada", fator: variacaoToFator(projetada.variacao_mensal) };
  }
  // Sem dado — fallback neutro
  return { tipoTaxa: "Projetada", fator: 1.0 };
}

// ─── selectTipoTaxaInicial ────────────────────────────────────────────

const _warnedFallback = new Set<string>();

/**
 * Decide o Tipo_Taxa (IPCA | Projetada) inicial para a relação
 * (data_aplicacao, vencimento). Item 5 do enunciado:
 *  - Se `dia_aplicacao = dia_vencimento`:
 *      JanelaTeorica = data_aplicacao no dia_vencimento do próprio mês.
 *      Se `dia >= 15`  → 'Projetada' (IPCA do mês ainda não fechou na divulgação).
 *      Senão           → Oficial se já divulgada (data_linha >= data_div), senão Projetada.
 *  - Se `dia_aplicacao ≠ dia_vencimento`:
 *      ⚠ Regras A1–A7 ainda NÃO especificadas. Fallback temporário:
 *      Oficial da competência vigente se `data_linha >= data_divulgacao_oficial`,
 *      senão Projetada. Emite console.warn uma vez por chave (vencimento).
 */
export function selectTipoTaxaInicial(
  dataAplicacao: string,
  vencimento: string,
  records: CalendarioIpcaRecord[],
  warnKey?: string
): "IPCA" | "Projetada" {
  const index = buildIpcaIndex(records);
  const apDay = new Date(dataAplicacao + "T12:00:00").getUTCDate();
  const vcDay = new Date(vencimento + "T12:00:00").getUTCDate();

  if (apDay === vcDay) {
    const janela = computeJanelaTeorica(dataAplicacao, vencimento);
    const dia = new Date(janela + "T12:00:00").getUTCDate();
    // Competência vigente (mês anterior à JanelaTeorica)
    const jd = new Date(janela + "T12:00:00");
    const cy = jd.getUTCFullYear();
    const cm = jd.getUTCMonth() - 1;
    const compY = cm < 0 ? cy - 1 : cy;
    const compM = cm < 0 ? 11 : cm;
    const competencia = `${compY}-${String(compM + 1).padStart(2, "0")}-01`;
    if (dia >= 15) {
      return "Projetada";
    }
    const t = resolverTaxaCompetencia(competencia, janela, index);
    return t.tipoTaxa;
  }

  // Fallback A1–A7
  const key = warnKey ?? vencimento;
  if (!_warnedFallback.has(key)) {
    _warnedFallback.add(key);
    // eslint-disable-next-line no-console
    console.warn(
      "[IPCA] Regras A1–A7 não implementadas — usando fallback temporário (Oficial se divulgada, senão Projetada)",
      { dataAplicacao, vencimento }
    );
  }
  // Para o fallback usamos a competência via JanelaTeorica calculada normalmente
  const janela = computeJanelaTeorica(dataAplicacao, vencimento);
  const jd = new Date(janela + "T12:00:00");
  const cy = jd.getUTCFullYear();
  const cm = jd.getUTCMonth() - 1;
  const compY = cm < 0 ? cy - 1 : cy;
  const compM = cm < 0 ? 11 : cm;
  const competencia = `${compY}-${String(compM + 1).padStart(2, "0")}-01`;
  return resolverTaxaCompetencia(competencia, janela, index).tipoTaxa;
}

// ─── Daily map para CDBLIKE IPCA ─────────────────────────────────────

export interface IpcaDailyEntry {
  /** Multiplicador diário da inflação (>=1 em dia útil; 1 em não útil). */
  mult: number;
  /** Tipo da taxa que originou este dia. */
  tipoTaxa: "IPCA" | "Projetada" | null;
  /** Variação mensal (%) da competência IPCA aplicada nesse dia (fator - 1) * 100. */
  taxaMensalPct?: number | null;
}

/**
 * Constrói Map<date, { mult, tipoTaxa }> para o caminho CDBLIKE IPCA.
 *
 * Mecânica:
 *  - Para cada dia útil em [dataInicio, dataCalculo], obtém o ciclo de
 *    aniversário (override 15 — convenção ANBIMA) e a competência.
 *  - Decide tipo/fator pela `resolverTaxaCompetencia` (sem look-ahead).
 *  - Distribui o fator mensal pelos dias úteis do ciclo:
 *      dailyFactor = fator^(1/biz_days_in_cycle)
 *  - Em dia não útil: mult = 1, tipoTaxa = null.
 */
export function buildIpcaCdbLikeDailyMap(
  dataInicio: string,
  dataCalculo: string,
  vencimento: string,
  calendario: CalEntry[],
  records: CalendarioIpcaRecord[],
  overrideAnnDay: number = 15
): Map<string, IpcaDailyEntry> {
  const annDay = overrideAnnDay ?? getAnniversaryDay(vencimento);
  const index = buildIpcaIndex(records);
  const result = new Map<string, IpcaDailyEntry>();

  const sortedCal = [...calendario].sort((a, b) => a.data.localeCompare(b.data));

  const bizDaysSet = new Set<string>();
  for (const cal of sortedCal) {
    if (cal.dia_util) bizDaysSet.add(cal.data);
  }

  const cycleCache = new Map<string, { fator: number; tipoTaxa: "IPCA" | "Projetada"; divisor: number }>();

  for (const cal of sortedCal) {
    if (cal.data < dataInicio || cal.data > dataCalculo) continue;

    if (!cal.dia_util) {
      result.set(cal.data, { mult: 1, tipoTaxa: null, taxaMensalPct: null });
      continue;
    }

    const bounds = getAnniversaryBounds(cal.data, annDay);
    const cacheKey = `${bounds.lastAnniversary}|${bounds.competencia}`;

    let cycleInfo = cycleCache.get(cacheKey);
    if (!cycleInfo) {
      let bizDaysInCycle = 0;
      for (const d of bizDaysSet) {
        if (d > bounds.lastAnniversary && d <= bounds.nextAnniversary) bizDaysInCycle++;
      }
      if (bizDaysInCycle === 0) bizDaysInCycle = 1;

      const t = resolverTaxaCompetencia(bounds.competencia, cal.data, index);
      cycleInfo = { fator: t.fator, tipoTaxa: t.tipoTaxa, divisor: bizDaysInCycle };
      cycleCache.set(cacheKey, cycleInfo);
    } else {
      // Reavalia tipo do dia (Oficial pode ter virado disponível ao longo do ciclo).
      const t = resolverTaxaCompetencia(bounds.competencia, cal.data, index);
      // Se o tipo do dia mudou, atualizamos só o tipoTaxa do dia (não recalculamos divisor).
      cycleInfo = { ...cycleInfo, tipoTaxa: t.tipoTaxa, fator: t.fator };
    }

    const dailyFactor = Math.pow(cycleInfo.fator, 1 / cycleInfo.divisor);
    const taxaMensalPct = (cycleInfo.fator - 1) * 100;
    result.set(cal.data, { mult: dailyFactor, tipoTaxa: cycleInfo.tipoTaxa, taxaMensalPct });
  }

  return result;
}

// ─── Data fetching ───────────────────────────────────────────────────

/**
 * Busca registros da `calendario_ipca` para uma janela de competências
 * que cubra o período [dataInicio, dataFim] (com folga de ±2 meses).
 * Retorna `undefined` se o indexador não for IPCA.
 */
export async function fetchCalendarioIpca(
  indexador: string | null | undefined,
  dataInicio: string,
  dataFim: string
): Promise<CalendarioIpcaRecord[] | undefined> {
  if (indexador !== "IPCA") return undefined;

  const start = new Date(dataInicio + "T12:00:00");
  start.setMonth(start.getMonth() - 2);
  const startMonth = start.toISOString().substring(0, 7) + "-01";

  const end = new Date(dataFim + "T12:00:00");
  end.setMonth(end.getMonth() + 2);
  const endMonth = end.toISOString().substring(0, 7) + "-01";

  // `calendario_ipca` ainda não está nos types gerados — cast pontual.
  const { data, error } = await (supabase as any)
    .from("calendario_ipca")
    .select("data, tipo, competencia, variacao_mensal")
    .gte("competencia", startMonth)
    .lte("competencia", endMonth)
    .order("competencia")
    .order("data");

  if (error) {
    // eslint-disable-next-line no-console
    console.error("[IPCA] erro ao ler calendario_ipca", error);
    return [];
  }

  return (data || []).map((r: any) => ({
    data: r.data,
    tipo: r.tipo as IpcaTipo,
    competencia: r.competencia,
    variacao_mensal: Number(r.variacao_mensal),
  }));
}

/**
 * Versão batch: se algum produto usa IPCA, busca uma única faixa
 * cobrindo todos.
 */
export async function fetchCalendarioIpcaBatch(
  products: { indexador?: string | null; data_inicio: string }[],
  dataFim: string
): Promise<CalendarioIpcaRecord[] | undefined> {
  const hasIpca = products.some((p) => p.indexador === "IPCA");
  if (!hasIpca) return undefined;

  const minDate = products
    .filter((p) => p.indexador === "IPCA")
    .reduce((min, p) => (p.data_inicio < min ? p.data_inicio : min), "9999-12-31");

  return fetchCalendarioIpca("IPCA", minDate, dataFim);
}
