import { useMemo, useState } from "react";
import { useCatalog } from "@/hooks/use-catalog";
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

export function useAudit(): AuditState {
  const requests = useStudioStore((s) => s.requests);
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
