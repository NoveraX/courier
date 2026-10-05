import { useState } from "react";
import { runAudit } from "@/features/audit/run-audit";
import type { AuditResult } from "@/features/audit/types";
import { endpointKeyOf } from "@/features/explorer/endpoint-key";
import { useCatalog } from "@/hooks/use-catalog";
import { useStudioStore } from "@/store";
import { useAuditContext } from "./use-audit-context";

/** An audit as it ran: what it found, what it read, and when. */
export interface AuditReport {
  result: AuditResult;
  /** The requests it read. */
  requests: number;
  /** The endpoints those requests called. */
  endpoints: number;
  /** When it ran. */
  at: number;
}

/** The audit shown, how much traffic came since, and what runs it again. */
export interface AuditReportControl {
  report: AuditReport;
  /** Requests captured since it ran. */
  newSince: number;
  rerun: () => void;
}

/**
 * The Audit page's report: the audit of the requests Studio held when the
 * page opened — or, opened before any came, when the first ones did — kept
 * as it is while it is read, so findings do not move under the reader, and
 * run again on demand; it says how many requests arrived since.
 *
 * @returns The report, the traffic since, and what runs it again
 * @example
 * ```ts
 * const { report, newSince, rerun } = useAuditReport();
 * ```
 */
export function useAuditReport(): AuditReportControl {
  const requests = useStudioStore((s) => s.requests);
  const catalog = useCatalog();
  const context = useAuditContext();
  const take = (): AuditReport => ({
    result: runAudit(requests, catalog, context),
    requests: requests.length,
    endpoints: new Set(requests.map(endpointKeyOf)).size,
    at: Date.now(),
  });
  const [report, setReport] = useState(take);
  /* A page opened before Studio sent its requests read none: it reads them once they come. */
  if (report.requests === 0 && requests.length > 0) setReport(take());
  return {
    report,
    newSince: requests.filter((r) => r.startedAt > report.at).length,
    rerun: () => setReport(take()),
  };
}
