import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { PortfolioMetrics, MonthlyRow } from "@/data/mockPortfolioData";

interface CDBParams {
  dataAplicacao: string;
  valorAplicado: number;
  percentualCDI: number;
  dataVencimento?: string;
}

interface DailyPoint {
  data: string;
  patrimonio: number;
  fatorAcumuladoCDI: number;
  fatorAcumuladoCDB: number;
}

interface CDBCalculationResult {
  metrics: PortfolioMetrics;
  monthly: MonthlyRow[];
  daily: DailyPoint[];
}

async function fetchCDIBusinessDays(startDate: string, endDate?: string) {
  let query = supabase
    .from("historico_cdi")
    .select("data, taxa_anual, dia_util")
    .eq("dia_util", false)
    .gte("data", startDate);

  if (endDate) {
    query = query.lte("data", endDate);
  }

  const { data, error } = await query.order("data", { ascending: true });

  if (error) throw error;

  return (data ?? []).map((row) => ({
    data: row.data,
    taxa_anual: Number(row.taxa_anual),
  }));
}

function calculateCDB(
  cdiHistory: { data: string; taxa_anual: number }[],
  params: CDBParams
): CDBCalculationResult {
  const { valorAplicado, percentualCDI } = params;
  const multiplier = percentualCDI / 100;

  let fatorAcumCDI = 1;
  let fatorAcumCDB = 1;
  const daily: DailyPoint[] = [];

  for (const row of cdiHistory) {
    const taxaAnual = row.taxa_anual;
    const fatorDiarioCDI = Math.pow(1 + taxaAnual / 100, 1 / 252);
    const rateDiariaCDI = fatorDiarioCDI - 1;
    const fatorDiarioCDB = 1 + rateDiariaCDI * multiplier;

    fatorAcumCDI *= fatorDiarioCDI;
    fatorAcumCDB *= fatorDiarioCDB;

    daily.push({
      data: row.data,
      patrimonio: valorAplicado * fatorAcumCDB,
      fatorAcumuladoCDI: fatorAcumCDI,
      fatorAcumuladoCDB: fatorAcumCDB,
    });
  }

  const monthlyMap = new Map<string, {
    lastDay: DailyPoint;
    prevMonthEnd: DailyPoint | null;
  }>();

  const MONTH_LABELS = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"];

  for (let i = 0; i < daily.length; i++) {
    const d = daily[i];
    const date = new Date(d.data + "T12:00:00");
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

    const existing = monthlyMap.get(key);
    if (!existing || d.data > existing.lastDay.data) {
      monthlyMap.set(key, {
        lastDay: d,
        prevMonthEnd: existing?.prevMonthEnd ?? null,
      });
    }
  }

  const sortedKeys = Array.from(monthlyMap.keys()).sort();

  const monthly: MonthlyRow[] = [];
  let prevEndFatorCDI = 1;
  let prevEndFatorCDB = 1;
  let prevEndPatrimonio = valorAplicado;

  for (const key of sortedKeys) {
    const entry = monthlyMap.get(key)!;
    const lastDay = entry.lastDay;
    const date = new Date(key + "-15");
    const monthLabel = MONTH_LABELS[date.getMonth()];

    const patrimonio = Math.round(lastDay.patrimonio * 100) / 100;
    const ganho = Math.round((lastDay.patrimonio - prevEndPatrimonio) * 100) / 100;
    const rent = prevEndFatorCDB > 0
      ? +((lastDay.fatorAcumuladoCDB / prevEndFatorCDB - 1) * 100).toFixed(4)
      : 0;
    const cdi = prevEndFatorCDI > 0
      ? +((lastDay.fatorAcumuladoCDI / prevEndFatorCDI - 1) * 100).toFixed(4)
      : 0;
    const sobreCdi = cdi !== 0 ? +((rent / cdi) * 100).toFixed(2) : 0;

    monthly.push({
      mes: monthLabel,
      patrimonio: Math.round(patrimonio),
      ganho: Math.round(ganho),
      rent: +rent.toFixed(2),
      cdi: +cdi.toFixed(2),
      sobreCdi,
      ano: date.getFullYear(),
      mesIndex: date.getMonth(),
    });

    prevEndFatorCDI = lastDay.fatorAcumuladoCDI;
    prevEndFatorCDB = lastDay.fatorAcumuladoCDB;
    prevEndPatrimonio = lastDay.patrimonio;
  }

  const lastPoint = daily[daily.length - 1];
  const patrimonioAtual = lastPoint ? lastPoint.patrimonio : valorAplicado;
  const ganhoTotal = patrimonioAtual - valorAplicado;
  const rentabilidadeTotal = ((patrimonioAtual / valorAplicado - 1) * 100);
  const cdiTotal = lastPoint ? ((lastPoint.fatorAcumuladoCDI - 1) * 100) : 0;
  const sobreCdiTotal = cdiTotal !== 0 ? (rentabilidadeTotal / cdiTotal) * 100 : 0;

  const metrics: PortfolioMetrics = {
    patrimonio: Math.round(patrimonioAtual * 100) / 100,
    ganho: Math.round(ganhoTotal * 100) / 100,
    rentabilidade: +rentabilidadeTotal.toFixed(2),
    cdi: +cdiTotal.toFixed(2),
    sobreCdi: +sobreCdiTotal.toFixed(2),
  };

  return { metrics, monthly, daily };
}

export function useCDBCalculation(params: CDBParams) {
  return useQuery({
    queryKey: ["cdb-calculation", params.dataAplicacao, params.valorAplicado, params.percentualCDI, params.dataVencimento],
    queryFn: async () => {
      const cdiHistory = await fetchCDIBusinessDays(params.dataAplicacao, params.dataVencimento);
      return calculateCDB(cdiHistory, params);
    },
    staleTime: 1000 * 60 * 60,
  });
}