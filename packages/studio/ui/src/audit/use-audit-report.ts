import { useState } from "react";
import { auditedCalls } from "@/features/audit/audited-calls";
import { runAudit } from "@/features/audit/run-audit";
import type { AuditResult } from "@/features/audit/types";
import { endpointKeyOf } from "@/features/explorer/endpoint-key";
import { ownRequests } from "@/features/requests/own-requests";
import { useCatalog } from "@/hooks/use-catalog";
import { useStudioStore } from "@/store";
import { useAuditContext } from "./use-audit-context";

/** An audit as it ran: what it found, what it read, and when. */
export interface AuditReport {
  result: AuditResult;
  /** The calls it read: the app's, finished. */
  calls: number;
  /** The requests those calls sent: a read another call's request answered sent none. */
  requests: number;
  /** The endpoints those calls reached. */
  endpoints: number;
  /** When it ran. */
  at: number;
}

/** The audit shown, how much traffic came since, and what runs it again. */
export interface AuditReportControl {
  report: AuditReport;
  /** Calls captured since it ran. */
  newSince: number;
  rerun: () => void;
}

/**
 * The Audit page's report: the audit of the calls Studio held when the
 * page opened — or, opened before any it reads had finished, when the
 * first ones did — kept as it is while it is read, so findings do not move
 * under the reader, and run again on demand; it says how many calls
 * arrived since.
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
  const take = (): AuditReport => {
    const read = auditedCalls(requests);
    return {
      result: runAudit(requests, catalog, context),
      calls: read.length,
      requests: ownRequests(read).length,
      endpoints: new Set(read.map(endpointKeyOf)).size,
      at: Date.now(),
    };
  };
  const [report, setReport] = useState(take);
  /* A page opened before any call it reads had finished read none: it reads them once they do. */
  if (report.calls === 0 && auditedCalls(requests).length > 0) setReport(take());
  return {
    report,
    newSince: requests.filter((r) => r.startedAt > report.at).length,
    rerun: () => setReport(take()),
  };
}
