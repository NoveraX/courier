import { createContext, useContext, useState } from "react";

import type { ReactNode } from "react";
import type { UpdateContext } from "./types";
import { useApis } from "./use-apis";

type ApisState = ReturnType<typeof useApis>;

interface ApisContextValue extends ApisState {
  updateCtx: UpdateContext | null;
  setUpdateCtx: (ctx: UpdateContext | null) => void;
}

const ApisContext = createContext<ApisContextValue | null>(null);

export function ApisProvider({ children }: { children: ReactNode }) {
  const cg = useApis();
  const [updateCtx, setUpdateCtx] = useState<UpdateContext | null>(null);

  return (
    <ApisContext.Provider value={{ ...cg, updateCtx, setUpdateCtx }}>
      {children}
    </ApisContext.Provider>
  );
}

export function useApisContext(): ApisContextValue {
  const ctx = useContext(ApisContext);
  if (!ctx) throw new Error("useApisContext must be used within ApisProvider");
  return ctx;
}
