import { useMemo } from "react";
import { useAuditContext } from "@/audit/use-audit-context";
import { CountBadge } from "@/design/count-badge";
import { runAudit } from "@/features/audit/run-audit";
import { useCatalog } from "@/hooks/use-catalog";
import { useThrottledValue } from "@/hooks/use-throttled-value";
import { useStudioStore } from "@/store";
import type { NavBadgeKind } from "../nav";

/* How often the score may run the whole audit again while requests arrive. */
const AUDIT_INTERVAL_MS = 1_000;

function RequestsBadge(): React.ReactNode {
  const count = useStudioStore((s) => s.requests.length);
  if (count === 0) return null;
  return <CountBadge tone="brand">{count > 999 ? "999+" : count}</CountBadge>;
}

function AuditScoreBadge(): React.ReactNode {
  const requests = useThrottledValue(
    useStudioStore((s) => s.requests),
    AUDIT_INTERVAL_MS,
  );
  const catalog = useCatalog();
  const context = useAuditContext();
  const score = useMemo(
    () => (requests.length === 0 ? null : runAudit(requests, catalog, context).score),
    [requests, catalog, context],
  );
  if (score === null) return null;
  const tone = score >= 90 ? "ok" : score >= 70 ? "warn" : "err";
  return <CountBadge tone={tone}>{score}</CountBadge>;
}

/**
 * What the sidebar shows beside a view: the captured requests beside
 * Timeline, the audit's score beside Audit — nothing while there is none.
 *
 * @param props - Which badge
 * @returns The badge, or nothing
 * @example
 * ```tsx
 * <NavBadge kind="requests" />
 * ```
 */
export function NavBadge({ kind }: { kind: NavBadgeKind }): React.ReactNode {
  return kind === "requests" ? <RequestsBadge /> : <AuditScoreBadge />;
}
