import { configNotice } from "@/features/config/config-notice";
import { formatSize } from "@/lib/formatters";
import type { RequestEntry } from "@/store";
import { useStudioStore } from "@/store";

interface Counts {
  errors: number;
  pending: number;
  streams: number;
  /** The bytes of the responses captured. */
  bytes: number;
}

function countOf(requests: readonly RequestEntry[]): Counts {
  const counts = { errors: 0, pending: 0, streams: 0, bytes: 0 };
  for (const r of requests) {
    if (r.status === "error") counts.errors++;
    if (r.status === "pending") counts.pending++;
    if (r.streamStatus === "streaming") counts.streams++;
    counts.bytes += r.size ?? 0;
  }
  return counts;
}

/* A binding conflict, said where the counts are, with who claims what. */
function ConflictNotice(): React.ReactNode {
  const error = useStudioStore((s) => s.lastBindingError);
  if (!error) return null;
  const { sourceName, transport, runtimeIds } = error.details;
  const title = `Binding conflict on ${sourceName} (${transport}) — claimed by ${runtimeIds.join(", ")}. Stop all but one runtime to resolve.`;
  return (
    <span role="status" aria-live="polite" title={title} aria-label={title} className="text-err">
      binding conflict
    </span>
  );
}

function ConfigStatusNotice(): React.ReactNode {
  const notice = configNotice(useStudioStore((s) => s.configStatus));
  if (!notice) return null;
  return (
    <span
      role="status"
      aria-live="polite"
      title={notice.title}
      aria-label={notice.title}
      className={notice.failed ? "text-err" : "text-warn"}
    >
      {notice.label}
    </span>
  );
}

/**
 * The status bar's counts: requests and the bytes they brought, errors,
 * calls in flight, live streams, the ones dropped past the limit — and whatever Studio needs said
 * everywhere: a binding conflict, a config it cannot run, a saved session
 * shown, recording paused.
 *
 * @returns The segment
 * @example
 * ```tsx
 * <TrafficSegment />
 * ```
 */
export function TrafficSegment(): React.ReactNode {
  const requests = useStudioStore((s) => s.requests);
  const dropped = useStudioStore((s) => s.droppedRequests);
  const paused = useStudioStore((s) => s.paused);
  const session = useStudioStore((s) => s.shownSession);
  const { errors, pending, streams, bytes } = countOf(requests);
  return (
    <div className="flex flex-1 items-center gap-3.5 overflow-hidden border-l border-line px-3">
      <span>{requests.length} req</span>
      <span>{formatSize(bytes)}</span>
      {errors > 0 && <span className="text-err">{errors} err</span>}
      {pending > 0 && <span className="text-warn">{pending} pending</span>}
      {streams > 0 && (
        <span className="text-brand">{streams === 1 ? "1 stream" : `${streams} streams`}</span>
      )}
      {dropped > 0 && (
        <span
          className="text-warn"
          title={`${dropped} older requests dropped — raise the limit in Settings`}
        >
          {dropped} dropped
        </span>
      )}
      <ConflictNotice />
      <ConfigStatusNotice />
      {session && <span className="truncate text-warn">session {session.name}</span>}
      {paused && !session && <span className="font-semibold text-warn">REC PAUSED</span>}
    </div>
  );
}
