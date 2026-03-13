import { createContext, useContext } from "react";

import type { ReactNode } from "react";
import type { SourceMap } from "../../store";

interface ExplorerContextValue {
  sourceMap: SourceMap;
  onSelectEndpoint: (ep: { source: string; group: string; method: string }) => void;
}

const ExplorerContext = createContext<ExplorerContextValue | null>(null);

export function ExplorerProvider({
  sourceMap,
  onSelectEndpoint,
  children,
}: ExplorerContextValue & { children: ReactNode }) {
  return (
    <ExplorerContext.Provider value={{ sourceMap, onSelectEndpoint }}>
      {children}
    </ExplorerContext.Provider>
  );
}

export function useExplorerContext(): ExplorerContextValue {
  const ctx = useContext(ExplorerContext);
  if (!ctx) throw new Error("useExplorerContext must be used within ExplorerProvider");
  return ctx;
}
