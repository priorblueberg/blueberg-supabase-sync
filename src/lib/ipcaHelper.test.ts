import { describe, expect, it } from "vitest";
import { buildIpcaCdblikeDailyFactorMap } from "./ipcaHelper";

const calendario = [
  "2024-01-29",
  "2024-01-30",
  "2024-01-31",
  "2024-02-01",
  "2024-02-02",
  "2024-02-05",
  "2024-02-06",
  "2024-02-07",
  "2024-02-08",
  "2024-02-09",
  "2024-02-12",
  "2024-02-13",
  "2024-02-14",
  "2024-02-15",
  "2024-02-16",
  "2024-02-19",
  "2024-02-20",
  "2024-02-21",
  "2024-02-22",
  "2024-02-23",
  "2024-02-26",
  "2024-02-27",
  "2024-02-28",
  "2024-02-29",
].map((data) => ({ data, dia_util: true }));

describe("IPCA helper", () => {
  it("mantém projetada até a véspera da divulgação oficial na primeira janela da aplicação", () => {
    const map = buildIpcaCdblikeDailyFactorMap(
      "2024-01-29",
      "2024-02-29",
      "2025-12-29",
      calendario,
      [
        { data: "2024-01-11", tipo: "Oficial", competencia: "2023-11-01", variacao_mensal: 0.28 },
        { data: "2024-01-26", tipo: "Projetada", competencia: "2024-01-01", variacao_mensal: 0.38 },
        { data: "2024-02-08", tipo: "Oficial", competencia: "2024-01-01", variacao_mensal: 0.42 },
      ]
    );

    for (const data of ["2024-01-29", "2024-01-30", "2024-01-31", "2024-02-01", "2024-02-02", "2024-02-05", "2024-02-06", "2024-02-07"]) {
      expect(map.get(data)?.tipoTaxa).toBe("Projetada");
      expect(map.get(data)?.taxaMensalPct).toBe(0.38);
    }

    expect(map.get("2024-02-08")?.tipoTaxa).toBe("IPCA");
    expect(map.get("2024-02-08")?.taxaMensalPct).toBe(0.42);
    expect(map.get("2024-02-08")?.isAcerto).toBe(true);
  });
});