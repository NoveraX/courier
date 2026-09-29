import { useMemo } from "react";

import { useStudioStore } from "@/store";
import type { AuditContext } from "./types";

/**
 * What the audit weighs besides the requests: which sessions are runtimes
 * that run in a browser, as Studio last reported the connected runtimes.
 *
 * @returns The context to run the audit with
 *
 * @example
 * ```ts
 * const context = useAuditContext();
 * const { score } = runAudit(requests, catalog, context);
 * ```
 */
export function useAuditContext(): AuditContext {
  const runtimes = useStudioStore((s) => s.bindingSnapshot.runtimes);
  return useMemo(
    () => ({
      browserSessions: new Set(
        runtimes.filter((r) => r.kind === "browser").map((r) => r.runtimeId),
      ),
    }),
    [runtimes],
  );
}
