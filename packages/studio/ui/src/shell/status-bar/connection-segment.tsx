import { cn } from "@/lib/utils";
import { useStudioStore } from "@/store";
import { sessionClock } from "../session-clock";

const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? "" : "s"}`;

/* The session's length, ticking while a runtime is attached. */
function SessionClock({ since }: { since: number }): React.ReactNode {
  const tick = useStudioStore((s) => s.clientTick);
  return <span className="opacity-65">{sessionClock(tick >= 0 ? Date.now() - since : 0)}</span>;
}

/**
 * The status bar's first segment — the only place that says how Studio's
 * connection stands: the runtimes and sources while an app is attached, with
 * the session's length; that Studio waits for one; or what the page does
 * about a connection lost.
 *
 * @returns The segment
 * @example
 * ```tsx
 * <ConnectionSegment />
 * ```
 */
export function ConnectionSegment(): React.ReactNode {
  const status = useStudioStore((s) => s.connectionStatus);
  const { runtimeCount, sourceCount } = useStudioStore((s) => s.bindingSnapshot);
  const since = useStudioStore((s) => s.sessionStartedAt);
  const attached = status === "connected" && runtimeCount > 0;
  const waiting = status === "connected" && runtimeCount === 0;
  const label = attached
    ? `${plural(runtimeCount, "runtime")} · ${plural(sourceCount, "source")}`
    : waiting
      ? "waiting for an app"
      : status === "reconnecting"
        ? "reconnecting…"
        : status === "connecting"
          ? "connecting…"
          : "disconnected";
  return (
    <div
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
