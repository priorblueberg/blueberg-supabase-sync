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
  patrimonio: number;
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

interface SubPart {
  prevLiq: number;
  rentDiariaPct: number;
}

export function calcularCarteiraInvestimentos(input: ConsolidatedInput): ConsolidatedDailyRow[] {
  const { rfRows, cambioRows, dataInicio, dataCalculo } = input;

  const dateMap = new Map<string, {
    diaUtil: boolean;
    patrimonio: number;
    aplicacoes: number;
    resgates: number;
    ganhoDiarioRS: number;
    subParts: SubPart[];
  }>();

  const addRows = (rows: CarteiraRFRow[]) => {
    let prev = 0;
    for (const r of rows) {
      if (r.data < dataInicio || r.data > dataCalculo) continue;
      const existing = dateMap.get(r.data);
      if (existing) {
        existing.patrimonio += r.liquido;
        existing.ganhoDiarioRS += r.rentDiariaRS;
        existing.subParts.push({ prevLiq: prev, rentDiariaPct: r.rentDiariaPct });
      } else {
        dateMap.set(r.data, {
          diaUtil: r.diaUtil,
          patrimonio: r.liquido,
          aplicacoes: 0,
          resgates: 0,
          ganhoDiarioRS: r.rentDiariaRS,
          subParts: [{ prevLiq: prev, rentDiariaPct: r.rentDiariaPct }],
        });
      }
      prev = r.liquido;
    }
  };

  addRows(rfRows);
  addRows(cambioRows);

  const sorted = Array.from(dateMap.entries())
    .sort(([a], [b]) => a.localeCompare(b));

  const result: ConsolidatedDailyRow[] = [];
  let ganhoAcumulado = 0;
  let rentAcumuladaFactor = 1;

  for (const [data, agg] of sorted) {
    // Weighted daily return from sub-portfolios
    const totalPrev = agg.subParts.reduce((s, p) => s + p.prevLiq, 0);
    const rentDiariaPct = totalPrev > 0.01
      ? agg.subParts.reduce((s, p) => s + p.rentDiariaPct * p.prevLiq, 0) / totalPrev
      : 0;

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
  }

  return result;
}
