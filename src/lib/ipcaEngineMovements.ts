import type { DailyRow } from "@/lib/rendaFixaEngine";

export interface EngineMovementDisplay {
  data: string;
  tipo_movimentacao: "Amortização" | "Pagamento de Juros";
  valor: number;
}

const MIN_DISPLAY_VALUE = 0.001;

export function buildIpcaCdblikeEngineMovements(rows: DailyRow[]): EngineMovementDisplay[] {
  const movimentos: EngineMovementDisplay[] = [];

  for (const row of rows) {
    if ((row.resgates ?? 0) > MIN_DISPLAY_VALUE) {
      movimentos.push({
        data: row.data,
        tipo_movimentacao: "Amortização",
        valor: row.resgates,
      });
    }

    if ((row.jurosPago ?? 0) > MIN_DISPLAY_VALUE) {
      movimentos.push({
        data: row.data,
        tipo_movimentacao: "Pagamento de Juros",
        valor: row.jurosPago,
      });
    }
  }

  return movimentos;
}

export function isIpcaCdblike(engine: string | null | undefined, indexador: string | null | undefined): boolean {
  return engine === "CDBLIKE" && indexador === "IPCA";
}
