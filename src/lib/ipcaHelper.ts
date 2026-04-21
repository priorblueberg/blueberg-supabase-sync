/**
 * IPCA Helper — fonte única: tabela `calendario_ipca`.
 *
 * Modelo do simulador Blueberg para CDBLIKE + IPCA:
 *   - Aniversário do título = dia do vencimento (clamp ao último dia do mês).
 *   - Janela = intervalo (aniv_inicio, aniv_fim] entre dois aniversários consecutivos.
 *   - Competência da janela = mês imediatamente anterior ao `inicio` da janela.
 *   - Decisão Oficial vs Projetada por dia, sem look-ahead.
 *   - fator_diario = (1 + variacao_mensal/100) ^ (1 / dias_uteis_da_janela).
 *
 * Sem look-ahead: Oficial só é usada se `data_linha >= data_divulgacao_oficial`.
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

export interface JanelaIpca {
  /** Aniversário inicial (excluído da contagem). */
  inicio: string;
  /** Aniversário final (incluído na contagem). */
  fim: string;
  /** Competência YYYY-MM-01 (mês anterior ao `inicio`). */
  competencia: string;
}

// ─── Helpers de data ─────────────────────────────────────────────────

function clampDay(year: number, month: number, targetDay: number): number {
  const lastDay = new Date(year, month + 1, 0).getDate();
  return Math.min(targetDay, lastDay);
}

function toIso(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function getVencDay(vencimento: string): number {
  return new Date(vencimento + "T12:00:00").getUTCDate();
}

// ─── Conceito 1 — Data de aniversário ────────────────────────────────

/**
 * Retorna a data ISO do aniversário do título no mês (`ano`, `mes`),
 * onde `mes` é 1..12. Se o dia do vencimento não existir no mês, usa
 * o último dia do mês (ex.: vencimento dia 31 em novembro → dia 30).
 */
export function getDataAniversario(vencimento: string, ano: number, mes: number): string {
  const m = mes - 1;
  const day = clampDay(ano, m, getVencDay(vencimento));
  return toIso(ano, m, day);
}

// ─── Conceito 2 — Janela de cálculo ──────────────────────────────────

/**
 * Janela vigente para uma data:
 *   - inicio = último aniversário ≤ data
 *   - fim    = próximo aniversário >  data
 *   - competencia = primeiro dia do mês anterior ao início da janela
 */
export function getJanelaAtual(data: string, vencimento: string): JanelaIpca {
  const dt = new Date(data + "T12:00:00");
  const y = dt.getUTCFullYear();
  const m = dt.getUTCMonth(); // 0..11
  const day = dt.getUTCDate();
  const vencDay = getVencDay(vencimento);
  const annThisMonth = clampDay(y, m, vencDay);

  let iniY: number, iniM: number;
  let fimY: number, fimM: number;

  if (day >= annThisMonth) {
    // Janela atual começa neste mês e termina no próximo
    iniY = y; iniM = m;
    if (m === 11) { fimY = y + 1; fimM = 0; } else { fimY = y; fimM = m + 1; }
  } else {
    // Janela atual começou no mês anterior e termina neste mês
    if (m === 0) { iniY = y - 1; iniM = 11; } else { iniY = y; iniM = m - 1; }
    fimY = y; fimM = m;
  }

  const inicio = toIso(iniY, iniM, clampDay(iniY, iniM, vencDay));
  const fim = toIso(fimY, fimM, clampDay(fimY, fimM, vencDay));

  // Competência = mês anterior ao `inicio` da janela (modelo Blueberg).
  // Ex.: janela (02/01/2024, 02/02/2024] usa IPCA de 2023-12, pois o IPCA de
  // dez/2023 é divulgado em meados de jan/2024 e passa a valer a partir daí.
  let compY = iniY;
  let compM = iniM - 1;
  if (compM < 0) { compM = 11; compY -= 1; }
  const competencia = `${compY}-${String(compM + 1).padStart(2, "0")}-01`;

  return { inicio, fim, competencia };
}

// ─── Conceito 3 — Dias úteis da janela (inicio, fim] ─────────────────

/**
 * Conta dias úteis estritamente em `(janela.inicio, janela.fim]`.
 * Considera apenas `dia_util === true`.
 */
export function countDiasUteisJanela(
  janela: JanelaIpca,
  calendario: CalEntry[]
): number {
  let n = 0;
  for (const c of calendario) {
    if (!c.dia_util) continue;
    if (c.data > janela.inicio && c.data <= janela.fim) n++;
  }
  return n;
}

// ─── Conceito 4 — Registro IPCA da competência (sem look-ahead) ──────

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

export interface RegistroIpcaResolvido {
  tipo: "IPCA" | "Projetada";
  variacaoMensal: number;
}

/**
 * Resolve, para uma competência e uma data de linha, qual taxa usar:
 *  - Oficial se existir e `dataLinha >= data_divulgacao_oficial`.
 *  - Senão Projetada (se existir).
 *  - Fallback final: 0% (calendario_ipca incompleto) — emite warn único por competência.
 */
const _ipcaMissingWarned = new Set<string>();
export function getRegistroIpcaDaCompetencia(
  competencia: string,
  dataLinha: string,
  index: IpcaIndex
): RegistroIpcaResolvido {
  const key = competencia.substring(0, 7);
  const oficial = index.oficial.get(key);
  if (oficial && oficial.data <= dataLinha) {
    return { tipo: "IPCA", variacaoMensal: Number(oficial.variacao_mensal) };
  }
  const projetada = index.projetada.get(key);
  if (projetada) {
    return { tipo: "Projetada", variacaoMensal: Number(projetada.variacao_mensal) };
  }
  if (!_ipcaMissingWarned.has(key)) {
    _ipcaMissingWarned.add(key);
    // eslint-disable-next-line no-console
    console.warn(`[IPCA] competência ${key} ausente em calendario_ipca — usando 0% (verifique RLS/seed da tabela).`);
  }
  return { tipo: "Projetada", variacaoMensal: 0 };
}

// ─── Conceito 5 — Tipo da taxa por dia ───────────────────────────────

export function getTipoTaxaPorDia(
  data: string,
  vencimento: string,
  calendario: CalEntry[],
  registros: CalendarioIpcaRecord[]
): "IPCA" | "Projetada" | null {
  const cal = calendario.find((c) => c.data === data);
  if (!cal || !cal.dia_util) return null;
  const janela = getJanelaAtual(data, vencimento);
  const idx = buildIpcaIndex(registros);
  return getRegistroIpcaDaCompetencia(janela.competencia, data, idx).tipo;
}

// ─── Conceitos 6/7/8 — Daily map para CDBLIKE IPCA ───────────────────

export interface IpcaDailyEntry {
  /** Multiplicador diário da inflação (>=1 em dia útil; 1 em não útil). */
  mult: number;
  /** Tipo da taxa que originou este dia. */
  tipoTaxa: "IPCA" | "Projetada" | null;
  /** Variação mensal (%) da competência aplicada nesse dia. */
  taxaMensalPct: number | null;
}

/**
 * Constrói Map<data, { mult, tipoTaxa, taxaMensalPct }> para o caminho
 * CDBLIKE + IPCA, conforme modelo Blueberg.
 *
 *  - Para cada dia útil em [dataInicio, dataCalculo]:
 *      janela    = getJanelaAtual(data, vencimento)
 *      divisor   = countDiasUteisJanela(janela, calendario)
 *      { tipo, variacaoMensal } = getRegistroIpcaDaCompetencia(janela.competencia, data, index)
 *      mult      = (1 + variacaoMensal/100)^(1/divisor)
 *  - Em dia não útil: mult = 1, tipoTaxa = null, taxaMensalPct = null.
 */
export function buildIpcaCdblikeDailyFactorMap(
  dataInicio: string,
  dataCalculo: string,
  vencimento: string,
  calendario: CalEntry[],
  registros: CalendarioIpcaRecord[]
): Map<string, IpcaDailyEntry> {
  const index = buildIpcaIndex(registros);
  const result = new Map<string, IpcaDailyEntry>();

  const sortedCal = [...calendario].sort((a, b) => a.data.localeCompare(b.data));

  // Cache do divisor por janela (chave = inicio|fim — independente da competência).
  const divisorCache = new Map<string, number>();
  function getDivisor(janela: JanelaIpca): number {
    const key = `${janela.inicio}|${janela.fim}`;
    let n = divisorCache.get(key);
    if (n === undefined) {
      n = countDiasUteisJanela(janela, sortedCal);
      if (n <= 0) n = 1;
      divisorCache.set(key, n);
    }
    return n;
  }

  for (const cal of sortedCal) {
    if (cal.data < dataInicio || cal.data > dataCalculo) continue;

    if (!cal.dia_util) {
      result.set(cal.data, { mult: 1, tipoTaxa: null, taxaMensalPct: null });
      continue;
    }

    const janela = getJanelaAtual(cal.data, vencimento);
    const divisor = getDivisor(janela);
    const { tipo, variacaoMensal } = getRegistroIpcaDaCompetencia(
      janela.competencia,
      cal.data,
      index
    );
    const fatorMensal = 1 + variacaoMensal / 100;
    const mult = Math.pow(fatorMensal, 1 / divisor);

    result.set(cal.data, {
      mult,
      tipoTaxa: tipo,
      taxaMensalPct: variacaoMensal,
    });
  }

  return result;
}


// ─── Data fetching ───────────────────────────────────────────────────

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
