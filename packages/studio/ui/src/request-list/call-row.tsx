import { durationTone } from "@/features/requests/duration-tone";
import type { RecentCall } from "@/features/requests/recent-calls";
import { codeLabel } from "@/features/requests/request-parts";
import { isFailedState, isStreamRequest } from "@/features/requests/request-state";
import { formatAbsoluteTime, formatDuration, formatSize } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import { SharedChip } from "@/screens/timeline/shared-chip";

const BAR_FILL = { normal: "bg-brand", warn: "bg-warn", err: "bg-err" } as const;
const DURATION_TEXT = { normal: "text-fg-muted", warn: "text-warn", err: "text-err" } as const;

interface CallRowProps {
  call: RecentCall;
  slowMs: number;
  onOpen: (id: string) => void;
  /** Adds the response's size as a last column. */
  withSize?: boolean | undefined;
  /** The row's own height, padding, edges and hover. */
  className?: string | undefined;
}

function codeTone({ state }: RecentCall): string {
  if (state === "aborted") return "text-fg-subtle";
  if (isFailedState(state)) return "text-err";
  return state === "pending" ? "text-warn" : "text-ok";
}

function durationLabel({ request: r, state }: RecentCall, stream: boolean): string {
  if (stream) return state === "streaming" ? "live" : "closed";
  const total = r.timing?.total;
  return state === "pending" || total === undefined ? "···" : formatDuration(total);
}

/**
 * One call of an endpoint, as a list of them shows it — when it began, how
 * it went, its status, how long it took against the others and, when
 * asked, its size — opening in the inspector; a call another call's
 * request answered is marked `shared`. A row too narrow for the bar that
 * sets its time against the others keeps the time in words alone, and the
 * mark beside when it began.
 *
 * @param props - The call, the slow threshold, what opens it, and its columns and look
 * @returns The row
 * @example
 * ```tsx
 * <CallRow call={call} slowMs={500} onOpen={open} className="h-8 px-3" />
 * ```
 */
export function CallRow({
  call,
  slowMs,
  onOpen,
  withSize,
  className,
}: CallRowProps): React.ReactNode {
  const { request: r, state, share } = call;
  const stream = isStreamRequest(r);
  const total = r.timing?.total;
  const tone = total === undefined ? "normal" : durationTone(total, slowMs);
  return (
    <button
      type="button"
      onClick={() => onOpen(r.id)}
      className={cn(
        "@container flex w-full cursor-pointer items-center text-left font-mono text-label tabular-nums focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand",
        className,
      )}
    >
      <span
        className={cn(
          "grid min-w-0 flex-1 items-center gap-2.5",
          withSize
            ? "grid-cols-[92px_44px_minmax(0,1fr)_58px_64px] @max-[23rem]:grid-cols-[minmax(0,1fr)_44px_58px_64px]"
            : "grid-cols-[92px_44px_minmax(0,1fr)_58px] @max-[18rem]:grid-cols-[minmax(0,1fr)_44px_58px]",
        )}
      >
        <span className="flex min-w-0 items-center gap-1.5 text-fg-subtle">
          <span className="truncate">{formatAbsoluteTime(r.startedAt)}</span>
          {r.shared && (
            <span
              className={cn(
                "hidden",
                withSize ? "@max-[23rem]:inline-flex" : "@max-[18rem]:inline-flex",
              )}
            >
              <SharedChip shared={r.shared} />
            </span>
          )}
        </span>
        <span className={codeTone(call)}>{codeLabel(r, state)}</span>
        <span
          className={cn(
            "flex min-w-0 items-center gap-2",
            withSize ? "@max-[23rem]:hidden" : "@max-[18rem]:hidden",
          )}
        >
          {r.shared && <SharedChip shared={r.shared} />}
          <span className="h-1 min-w-0 flex-1 overflow-hidden rounded-[2px] bg-raised">
            <span
              className={cn("block h-full", stream ? "bg-brand-dim" : BAR_FILL[tone])}
              style={{ width: `${share * 100}%` }}
            />
          </span>
        </span>
        <span className={cn("text-right", stream ? "text-brand" : DURATION_TEXT[tone])}>
          {durationLabel(call, stream)}
        </span>
        {withSize && (
          <span className="text-right text-fg-subtle">{r.size ? formatSize(r.size) : "—"}</span>
        )}
      </span>
    </button>
  );
}
