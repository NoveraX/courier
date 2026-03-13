import { createFileRoute } from "@tanstack/react-router";
import { AuditView } from "../views/audit";
import { TabSkeleton } from "../components/skeleton";

import type { AuditSeverityFilter } from "../store";

export interface AuditSearchParams {
  severity?: AuditSeverityFilter;
}

function validateSearch(raw: Record<string, unknown>): AuditSearchParams {
  const valid = ["error", "warning", "hint", "pass", "all"];
  return {
    severity: typeof raw.severity === "string" && valid.includes(raw.severity)
      ? raw.severity as AuditSeverityFilter
      : undefined,
  };
}

export const Route = createFileRoute("/audit")({
  component: AuditView,
  pendingComponent: TabSkeleton,
  validateSearch,
});
