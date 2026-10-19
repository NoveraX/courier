import { formatSize } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import { useStudioStore } from "@/store";
import { connectionLabel } from "./connection-label";
import { SessionLength } from "./session-length";
import { StatusNotices } from "./status-notices";
import { studioPort } from "./studio-port";
import { capturedText, countTraffic } from "./traffic-counts";
import { useWatchState } from "./watch-state";

/* The connection's line, coloured as the status bar's segment is. */
function ConnectionLine(): React.ReactNode {
  const status = useStudioStore((s) => s.connectionStatus);
  const snapshot = useStudioStore((s) => s.bindingSnapshot);
  const known = useStudioStore((s) => s.received.runtimes);
  const since = useStudioStore((s) => s.sessionStartedAt);
  const attached = status === "connected" && snapshot.runtimeCount > 0;
  return (
    <p
      className={cn(
        "flex items-center gap-1.75",
        attached && "text-brand",
        status === "reconnecting" && "text-warn",
        status === "disconnected" && "text-err",
      )}
    >
      <span className="font-medium">{connectionLabel(status, known ? snapshot : null)}</span>
      {attached && since !== null && <SessionLength since={since} />}
    </p>
  );
}

/* The traffic's lines: what was captured, what failed, what is still in flight. */
function TrafficLines(): React.ReactNode {
  const requests = useStudioStore((s) => s.requests);
  const counts = countTraffic(requests);
  const { errors, pending, streams, bytes } = counts;
  return (
    <>
      <p>
        {capturedText(counts)} · {formatSize(bytes)}
      </p>
      {errors + pending + streams > 0 && (
        <p className="flex flex-wrap gap-x-3.5">
          {errors > 0 && <span className="text-err">{errors} err</span>}
          {pending > 0 && <span className="text-warn">{pending} pending</span>}
          {streams > 0 && (
            <span className="text-brand">{streams === 1 ? "1 stream" : `${streams} streams`}</span>
          )}
        </p>
      )}
    </>
  );
}

/**
 * The navigation drawer's status: the whole of what the status bar says —
 * the connection and the session's length, the files watched, the
 * traffic, whatever Studio needs said, and the port it serves on — for a
 * phone, whose status bar keeps only the connection and the counts of
 * requests and errors.
 *
 * @returns The status, a line each
 * @example
 * ```tsx
 * <StatusDetails />
 * ```
 */
export function StatusDetails(): React.ReactNode {
  const watch = useWatchState();
  return (
    <section
      aria-label="Status"
      className="flex flex-col gap-1.5 px-5 pt-1 pb-4 font-mono text-meta text-fg-subtle tabular-nums"
    >
      <h2 className="pt-1 pb-0.5 font-sans text-label font-medium">Status</h2>
      <ConnectionLine />
      {watch && <p className={cn(watch.reloading && "text-warn")}>{watch.label}</p>}
      <TrafficLines />
      <StatusNotices place="drawer" />
      <p className="opacity-70">studio :{studioPort(window.location)}</p>
    </section>
  );
}
