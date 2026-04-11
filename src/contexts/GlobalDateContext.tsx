import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import { endOfMonth, subMonths, subYears } from "date-fns";

export type PeriodoKey =
  | "30_dias" | "12_meses" | "mes_atual" | "ano_atual"
  | "mes_anterior" | "ano_anterior" | "desde_inicio";

interface GlobalDateContextType {
  dataSelecionada: Date;
  setDataSelecionada: (d: Date) => void;
  periodoSelecionado: PeriodoKey;
  setPeriodoSelecionado: (p: PeriodoKey) => void;
  periodoCompleto: boolean;
  aplicarPeriodo: (periodo: PeriodoKey) => void;
}

const GlobalDateContext = createContext<GlobalDateContextType | null>(null);

export function GlobalDateProvider({ children }: { children: ReactNode }) {
  const now = new Date();
  const anoAnt = subYears(now, 1);

  const [dataSelecionada, setDataSelecionada] = useState<Date>(
    () => new Date(anoAnt.getFullYear(), 11, 31)
  );
  const [periodoSelecionado, setPeriodoSelecionado] = useState<PeriodoKey>("ano_anterior");
  const [periodoCompleto, setPeriodoCompleto] = useState(false);

  const aplicarPeriodo = useCallback((periodo: PeriodoKey) => {
    const n = new Date();
    setPeriodoSelecionado(periodo);
    switch (periodo) {
      case "30_dias":
      case "12_meses":
      case "mes_atual":
      case "ano_atual":
        setDataSelecionada(n);
        setPeriodoCompleto(false);
        break;
      case "mes_anterior": {
        const mesAnt = subMonths(n, 1);
        setDataSelecionada(endOfMonth(mesAnt));
        setPeriodoCompleto(false);
        break;
      }
      case "ano_anterior": {
        const aa = subYears(n, 1);
        setDataSelecionada(new Date(aa.getFullYear(), 11, 31));
        setPeriodoCompleto(false);
        break;
      }
      case "desde_inicio":
        setDataSelecionada(n);
        setPeriodoCompleto(true);
        break;
    }
  }, []);

  return (
    <GlobalDateContext.Provider
      value={{
        dataSelecionada,
        setDataSelecionada,
        periodoSelecionado,
        setPeriodoSelecionado,
        periodoCompleto,
        aplicarPeriodo,
      }}
    >
      {children}
    </GlobalDateContext.Provider>
  );
}

export function useGlobalDate() {
  const ctx = useContext(GlobalDateContext);
  if (!ctx) throw new Error("useGlobalDate must be used within GlobalDateProvider");
  return ctx;
}