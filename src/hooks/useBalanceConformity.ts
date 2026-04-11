import { useMemo } from "react";
import { parseISO, isBefore, isAfter, startOfMonth, endOfMonth, isEqual } from "date-fns";

export type FullTransacao = {
  valor: number;
  data: string;
  categoria: string;
  subcategoria?: string;
  tipo: string;
  grupo_transferencia: string | null;
  instituicao_id: string | null;
  descricao?: string | null;
};

export type FullInstituicao = {
  id: string;
  apelido: string | null;
  nome: string;
  saldo_inicial: number;
  data_inicio: string | null;
  tipo_conta?: string;
};

export type MonthlyBreakdown = {
  saldoAnterior: number;
  receitas: number;
  despesas: number;
  aplicacoes: number;
  resgates: number;
  transfEntrada: number;
  transfSaida: number;
  saldoFinal: number;
};

export const CAIXA_TOTAL_ID = "__caixa_total__";

export function useBalanceConformity(
  transacoes: FullTransacao[],
  instituicoes: FullInstituicao[],
  selectedAccountId: string | null,
  year: number,
  cutoffDate?: Date
) {
  const isCaixaTotal = selectedAccountId === CAIXA_TOTAL_ID;

  const correnteIds = useMemo(() => {
    return new Set(instituicoes.filter((i) => i.tipo_conta === "corrente").map((i) => i.id));
  }, [instituicoes]);

  const filteredTx = useMemo(() => {
    if (isCaixaTotal) return transacoes.filter((t) => t.instituicao_id && correnteIds.has(t.instituicao_id));
    if (!selectedAccountId) return transacoes;
    return transacoes.filter((t) => t.instituicao_id === selectedAccountId);
  }, [transacoes, selectedAccountId, isCaixaTotal, correnteIds]);

  const filteredInst = useMemo(() => {
    if (isCaixaTotal) return instituicoes.filter((i) => i.tipo_conta === "corrente");
    if (!selectedAccountId) return instituicoes;
    return instituicoes.filter((i) => i.id === selectedAccountId);
  }, [instituicoes, selectedAccountId, isCaixaTotal]);

  const selectedInstitution = useMemo(() => {
    if (isCaixaTotal) return { id: CAIXA_TOTAL_ID, apelido: "Caixa Total", nome: "Caixa Total", saldo_inicial: 0, data_inicio: null, tipo_conta: "corrente" } as FullInstituicao;
    if (!selectedAccountId) return null;
    return instituicoes.find((i) => i.id === selectedAccountId) || null;
  }, [instituicoes, selectedAccountId, isCaixaTotal]);

  const monthlyData = useMemo(() => {
    const months: MonthlyBreakdown[] = [];

    for (let m = 0; m < 12; m++) {
      const monthStart = startOfMonth(new Date(year, m, 1));
      const monthEnd = endOfMonth(monthStart);

      const effectiveEnd = cutoffDate && cutoffDate.getFullYear() === year
        ? (isBefore(cutoffDate, monthEnd) ? cutoffDate : monthEnd)
        : monthEnd;

      const isAfterCutoff = cutoffDate && cutoffDate.getFullYear() === year && isAfter(monthStart, cutoffDate);

      let saldoAnterior = 0;
      const isIgnored = (t: FullTransacao) => t.categoria === "Transação Ignorada";

      filteredInst.forEach((inst) => {
        if (!inst.data_inicio || !isAfter(parseISO(inst.data_inicio), monthStart)) {
          saldoAnterior += Number(inst.saldo_inicial);
        }
      });

      filteredTx.forEach((t) => {
        if (isIgnored(t)) return;
        const d = parseISO(t.data);
        if (isBefore(d, monthStart)) {
          saldoAnterior += Number(t.valor);
        }
      });

      if (isAfterCutoff) {
        months.push({ saldoAnterior: 0, receitas: 0, despesas: 0, aplicacoes: 0, resgates: 0, transfEntrada: 0, transfSaida: 0, saldoFinal: 0 });
        continue;
      }

      const txInMonth = filteredTx.filter((t) => {
        const d = parseISO(t.data);
        return (isEqual(d, monthStart) || isAfter(d, monthStart)) &&
               (isEqual(d, effectiveEnd) || isBefore(d, effectiveEnd));
      });

      let receitas = 0;
      let despesas = 0;
      let aplicacoes = 0;
      let resgates = 0;
      let transfEntrada = 0;
      let transfSaida = 0;

      txInMonth.filter((t) => !isIgnored(t)).forEach((t) => {
        const val = Number(t.valor);
        const isTransfer = !!t.grupo_transferencia || t.categoria === "Transf. Entre Contas";
        const isAplicacao = t.categoria === "Aplicação";
        const isResgate = t.categoria === "Resgate";
        if (isTransfer) {
          if (val > 0) transfEntrada += val;
          else transfSaida += Math.abs(val);
        } else if (isAplicacao) {
          aplicacoes += Math.abs(val);
        } else if (isResgate) {
          resgates += Math.abs(val);
        } else {
          if (val > 0) receitas += val;
          else despesas += Math.abs(val);
        }
      });

      const saldoFinal = saldoAnterior + receitas + resgates + transfEntrada - despesas - aplicacoes - transfSaida;
      months.push({ saldoAnterior, receitas, despesas, aplicacoes, resgates, transfEntrada, transfSaida, saldoFinal });
    }

    return months;
  }, [filteredTx, filteredInst, year, cutoffDate]);

  const yearTotal = useMemo((): MonthlyBreakdown => ({
    saldoAnterior: monthlyData[0]?.saldoAnterior || 0,
    receitas: monthlyData.reduce((s, m) => s + m.receitas, 0),
    despesas: monthlyData.reduce((s, m) => s + m.despesas, 0),
    aplicacoes: monthlyData.reduce((s, m) => s + m.aplicacoes, 0),
    resgates: monthlyData.reduce((s, m) => s + m.resgates, 0),
    transfEntrada: monthlyData.reduce((s, m) => s + m.transfEntrada, 0),
    transfSaida: monthlyData.reduce((s, m) => s + m.transfSaida, 0),
    saldoFinal: monthlyData[11]?.saldoFinal || 0,
  }), [monthlyData]);

  const currentMonthIndex = useMemo(() => {
    if (cutoffDate && cutoffDate.getFullYear() === year) return cutoffDate.getMonth();
    const now = new Date();
    if (now.getFullYear() === year) return now.getMonth();
    return 11;
  }, [year, cutoffDate]);

  return {
    monthlyData,
    yearTotal,
    currentMonthData: monthlyData[currentMonthIndex] || monthlyData[0],
    currentMonthIndex,
    selectedInstitution,
  };
}