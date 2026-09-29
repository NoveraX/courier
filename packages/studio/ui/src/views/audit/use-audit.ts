import { useMemo, useState } from "react";
import { useCatalog } from "@/hooks/use-catalog";
import { useThrottledValue } from "@/hooks/use-throttled-value";
import { useStudioStore } from "../../store";
import { runAudit } from "./run-audit";
import type { AuditCategory, AuditResult } from "./types";
import { useAuditContext } from "./use-audit-context";

export type SeverityFilter = "error" | "warning" | "hint" | "pass" | "all";

export interface AuditState {
  result: AuditResult;
  severityFilter: SeverityFilter;
  categoryFilter: AuditCategory | "all";
  setSeverityFilter: (f: SeverityFilter) => void;
  setCategoryFilter: (f: AuditCategory | "all") => void;
  filteredItems: AuditResult["items"];
}

/* How often the audit may run again while requests arrive. */
const AUDIT_INTERVAL_MS = 1_000;

export function useAudit(): AuditState {
  const requests = useThrottledValue(
    useStudioStore((s) => s.requests),
    AUDIT_INTERVAL_MS,
  );
  const catalog = useCatalog();
  const context = useAuditContext();
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState<AuditCategory | "all">("all");

  const result = useMemo(() => runAudit(requests, catalog, context), [requests, catalog, context]);

  const filteredItems = useMemo(
    () =>
      result.items.filter((item) => {
        if (severityFilter !== "all" && item.severity !== severityFilter) return false;
        if (categoryFilter !== "all" && item.category !== categoryFilter) return false;
        return true;
      }),
    [result, severityFilter, categoryFilter],
  );

  return {
    result,
    severityFilter,
    categoryFilter,
    setSeverityFilter,
    setCategoryFilter,
    filteredItems,
  };
}
