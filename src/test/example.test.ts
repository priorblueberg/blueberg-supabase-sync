import { describe, it, expect } from "vitest";
import {
  buildIpcaCdblikeDailyFactorMap,
  getTipoTaxaPorDia,
  type CalendarioIpcaRecord,
} from "@/lib/ipcaHelper";

describe("example", () => {
  it("should pass", () => {
    expect(true).toBe(true);
  });
});

describe("ipcaHelper", () => {
  const calendario = Array.from({ length: 12 }, (_, i) => {
    const dia = i + 1;
    return {
      data: `2024-02-${String(dia).padStart(2, "0")}`,
      dia_util: true,
    };
  }).concat([
    { data: "2024-01-29", dia_util: true },
    { data: "2024-01-30", dia_util: true },
    { data: "2024-01-31", dia_util: true },
  ]);

  const registros: CalendarioIpcaRecord[] = [
    { data: "2024-01-10", tipo: "Oficial", competencia: "2023-12-01", variacao_mensal: 0.56 },
    { data: "2024-01-26", tipo: "Projetada", competencia: "2024-01-01", variacao_mensal: 0.38 },
    { data: "2024-02-08", tipo: "Oficial", competencia: "2024-01-01", variacao_mensal: 0.42 },
  ];

  it("usa projetada entre aplicação inicial IPCA e divulgação oficial, e oficial na divulgação", () => {
    const map = buildIpcaCdblikeDailyFactorMap("2024-01-29", "2024-02-10", "2025-02-02", calendario, registros);

    expect(map.get("2024-01-29")?.tipoTaxa).toBe("Projetada");
    expect(map.get("2024-02-07")?.tipoTaxa).toBe("Projetada");
    expect(map.get("2024-02-08")?.tipoTaxa).toBe("IPCA");
    expect(map.get("2024-02-08")?.taxaMensalPct).toBe(0.42);
  });

  it("mantém a lógica normal quando a aplicação ocorre após a divulgação oficial", () => {
    const map = buildIpcaCdblikeDailyFactorMap("2024-02-09", "2024-02-10", "2025-02-02", calendario, registros);

    expect(map.get("2024-02-09")?.tipoTaxa).toBe("IPCA");
    expect(map.get("2024-02-09")?.taxaMensalPct).toBe(0.42);
  });

  it("mantém getTipoTaxaPorDia consistente com o cálculo diário", () => {
    const map = buildIpcaCdblikeDailyFactorMap("2024-01-29", "2024-02-10", "2025-02-02", calendario, registros);

    expect(getTipoTaxaPorDia("2024-02-07", "2025-02-02", calendario, registros, "2024-01-29"))
      .toBe(map.get("2024-02-07")?.tipoTaxa);
    expect(getTipoTaxaPorDia("2024-02-08", "2025-02-02", calendario, registros, "2024-01-29"))
      .toBe(map.get("2024-02-08")?.tipoTaxa);
  });
});
