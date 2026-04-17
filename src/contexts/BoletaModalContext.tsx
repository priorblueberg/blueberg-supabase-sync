import { createContext, useContext, useState, useCallback, ReactNode } from "react";
import type { CustodiaRowForBoleta } from "@/types/boleta";

export type BoletaOrigin = "header" | "posicao" | "edit";

export interface OpenBoletaOptions {
  origin: BoletaOrigin;
  tipo?: "Aplicação" | "Resgate";
  prefill?: CustodiaRowForBoleta;
  editId?: string;
}

interface BoletaModalContextType {
  isOpen: boolean;
  origin: BoletaOrigin;
  tipo?: "Aplicação" | "Resgate";
  prefill?: CustodiaRowForBoleta;
  editId?: string;
  openBoleta: (opts: OpenBoletaOptions) => void;
  closeBoleta: () => void;
}

const BoletaModalContext = createContext<BoletaModalContextType | null>(null);

export function BoletaModalProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{
    isOpen: boolean;
    origin: BoletaOrigin;
    tipo?: "Aplicação" | "Resgate";
    prefill?: CustodiaRowForBoleta;
    editId?: string;
  }>({ isOpen: false, origin: "header" });

  const openBoleta = useCallback((opts: OpenBoletaOptions) => {
    setState({ isOpen: true, ...opts });
  }, []);

  const closeBoleta = useCallback(() => {
    setState((s) => ({ ...s, isOpen: false }));
  }, []);

  return (
    <BoletaModalContext.Provider value={{ ...state, openBoleta, closeBoleta }}>
      {children}
    </BoletaModalContext.Provider>
  );
}

export function useBoletaModal() {
  const ctx = useContext(BoletaModalContext);
  if (!ctx) throw new Error("useBoletaModal must be used within BoletaModalProvider");
  return ctx;
}
