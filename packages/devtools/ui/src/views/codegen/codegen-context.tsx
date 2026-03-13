import { createContext, useContext, useState } from "react";

import type { ReactNode } from "react";
import type { UpdateContext } from "./types";
import { useCodegen } from "./use-codegen";

type CodegenState = ReturnType<typeof useCodegen>;

interface CodegenContextValue extends CodegenState {
  updateCtx: UpdateContext | null;
  setUpdateCtx: (ctx: UpdateContext | null) => void;
}

const CodegenContext = createContext<CodegenContextValue | null>(null);

export function CodegenProvider({ children }: { children: ReactNode }) {
  const cg = useCodegen();
  const [updateCtx, setUpdateCtx] = useState<UpdateContext | null>(null);

  return (
    <CodegenContext.Provider value={{ ...cg, updateCtx, setUpdateCtx }}>
      {children}
    </CodegenContext.Provider>
  );
}

export function useCodegenContext(): CodegenContextValue {
  const ctx = useContext(CodegenContext);
  if (!ctx) throw new Error("useCodegenContext must be used within CodegenProvider");
  return ctx;
}
