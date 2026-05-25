"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

export type CompanyMode = "sp" | "holding";

const HOLDING_COMPANY_NAME = "SILVA ADMINISTRADORA HOLDING LTDA";

const STORAGE_KEY = "company_mode";

interface CompanyContextValue {
  mode: CompanyMode;
  setMode: (m: CompanyMode) => void;
  /** Nome da empresa Holding (para filtrar dados) */
  holdingName: string;
  /** True quando o modo é "holding" */
  isHolding: boolean;
  /** Label amigável do modo atual */
  label: string;
}

const CompanyContext = createContext<CompanyContextValue>({
  mode: "sp",
  setMode: () => {},
  holdingName: HOLDING_COMPANY_NAME,
  isHolding: false,
  label: "Silva Packer",
});

export function CompanyProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<CompanyMode>("sp");

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "holding") setModeState("holding");
  }, []);

  const setMode = useCallback((m: CompanyMode) => {
    setModeState(m);
    localStorage.setItem(STORAGE_KEY, m);
  }, []);

  const value: CompanyContextValue = {
    mode,
    setMode,
    holdingName: HOLDING_COMPANY_NAME,
    isHolding: mode === "holding",
    label: mode === "holding" ? "Holding" : "Silva Packer",
  };

  return (
    <CompanyContext.Provider value={value}>
      {children}
    </CompanyContext.Provider>
  );
}

export function useCompanyMode() {
  return useContext(CompanyContext);
}
