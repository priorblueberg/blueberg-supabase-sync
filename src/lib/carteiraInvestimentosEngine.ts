/**
 * Engine de consolidação da Carteira de Investimentos.
 *
 * Recebe as séries diárias já calculadas de cada carteira segmentada
 * (Renda Fixa e Câmbio) e produz a série consolidada com:
 * - Patrimônio total
 * - Ganho financeiro total
 * - Rentabilidade consolidada (TWR composição diária)
 */

import { CarteiraRFRow } from "./carteiraRendaFixaEngine";

export interface ConsolidatedDailyRow {
  data: string;
  diaUtil: boolean;
  patrimonio: number;        // soma dos líquidos
  aplicacoes: number;
  resgates: number;
  ganhoDiarioRS: number;
  ganhoAcumuladoRS: number;
  rentDiariaPct: number;
  rentAcumuladaPct: number;
}

export interface ConsolidatedInput {
  rfRows: CarteiraRFRow[];
  cambioRows: CarteiraRFRow[];
  dataInicio: string;
  dataCalculo: string;
}

export function calcularCarteiraInvestimentos(input: ConsolidatedInput): ConsolidatedDailyRow[] {
  const { rfRows, cambioRows, dataInicio, dataCalculo } = input;

  // Merge both series into a date map
  const dateMap = new Map<string, {
    diaUtil: boolean;
    patrimonio: number;
    aplicacoes: number;
    resgates: number;
    ganhoDiarioRS: number;
  }>();

  const addRows = (rows: CarteiraRFRow[]) => {
    for (const r of rows) {
      if (r.data < dataInicio || r.data > dataCalculo) continue;
      const existing = dateMap.get(r.data);
      if (existing) {
        existing.patrimonio += r.liquido;
        existing.ganhoDiarioRS += r.rentDiariaRS;
      } else {
        dateMap.set(r.data, {
          diaUtil: r.diaUtil,
          patrimonio: r.liquido,
          aplicacoes: 0,
          resgates: 0,
          ganhoDiarioRS: r.rentDiariaRS,
        });
      }
    }
  };

  addRows(rfRows);
  addRows(cambioRows);

  const sorted = Array.from(dateMap.entries())
    .sort(([a], [b]) => a.localeCompare(b));

  const result: ConsolidatedDailyRow[] = [];
  let ganhoAcumulado = 0;
  let rentAcumuladaFactor = 1;
  let prevPatrimonio = 0;

  for (const [data, agg] of sorted) {
    const base = prevPatrimonio;
    const rentDiariaPct = base > 0.01 ? agg.ganhoDiarioRS / base : 0;
    ganhoAcumulado += agg.ganhoDiarioRS;
    rentAcumuladaFactor *= (1 + rentDiariaPct);

    result.push({
      data,
      diaUtil: agg.diaUtil,
      patrimonio: agg.patrimonio,
      aplicacoes: agg.aplicacoes,
      resgates: agg.resgates,
      ganhoDiarioRS: agg.ganhoDiarioRS,
      ganhoAcumuladoRS: ganhoAcumulado,
      rentDiariaPct,
      rentAcumuladaPct: rentAcumuladaFactor - 1,
    });

    prevPatrimonio = agg.patrimonio;
  }

  return result;
}
