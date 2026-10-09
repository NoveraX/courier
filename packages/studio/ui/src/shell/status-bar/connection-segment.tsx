import { cn } from "@/lib/utils";
import { useStudioStore } from "@/store";
import { sessionClock } from "../session-clock";
import { CONNECTION_TITLE, connectionLabel } from "./connection-label";

/* The session's length, ticking while a runtime is attached. */
function SessionClock({ since }: { since: number }): React.ReactNode {
  const tick = useStudioStore((s) => s.clientTick);
  return <span className="opacity-65">{sessionClock(tick >= 0 ? Date.now() - since : 0)}</span>;
}

/**
 * The status bar's first segment — the only place that says how Studio's
 * connection stands: the runtimes and sources while an app is attached, with
 * the session's length and what the counts count when the pointer rests on
 * it; that Studio waits for one; or what the page does about a connection
 * lost.
 *
 * @returns The segment
 * @example
 * ```tsx
 * <ConnectionSegment />
 * ```
 */
export function ConnectionSegment(): React.ReactNode {
  const status = useStudioStore((s) => s.connectionStatus);
  const snapshot = useStudioStore((s) => s.bindingSnapshot);
  const since = useStudioStore((s) => s.sessionStartedAt);
  const attached = status === "connected" && snapshot.runtimeCount > 0;
  const label = connectionLabel(status, snapshot);
  return (
    <div
      title={attached ? CONNECTION_TITLE : undefined}
      className={cn(
        "flex items-center gap-1.75 px-3",
        attached && "bg-brand-dim text-brand",
        status === "reconnecting" && "bg-warn-dim text-warn",
        status === "disconnected" && "bg-err-dim text-err",
      )}
    >
      <span className="font-medium">{label}</span>
      {attached && since !== null && <SessionClock since={since} />}
    </div>
  );
}
