import { Dot } from "@/design/dot";
import { recentCalls } from "@/features/explorer/endpoint-detail";
import type { EndpointNode } from "@/features/explorer/explorer-model";
import { durationTone } from "@/features/requests/duration-tone";
import { codeLabel } from "@/features/requests/request-parts";
import { isFailedState, isStreamRequest, STATE_META } from "@/features/requests/request-state";
import { formatAbsoluteTime, formatDuration } from "@/lib/formatters";
import { cn } from "@/lib/utils";

const BAR_FILL = { normal: "bg-brand", warn: "bg-warn", err: "bg-err" } as const;
const DURATION_TEXT = { normal: "text-fg-muted", warn: "text-warn", err: "text-err" } as const;

interface EndpointCallsProps {
  endpoint: EndpointNode;
  slowMs: number;
  onOpen: (id: string) => void;
}

/**
 * An endpoint's newest calls — when, how each went, its status and how
 * long it took against the others — each opening in the inspector.
 *
 * @param props - The endpoint, the slow threshold, and what opens a call
 * @returns The list
 * @example
 * ```tsx
 * <EndpointCalls endpoint={endpoint} slowMs={500} onOpen={open} />
 * ```
 */
export function EndpointCalls({ endpoint, slowMs, onOpen }: EndpointCallsProps): React.ReactNode {
  const calls = recentCalls(endpoint);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline gap-2">
        <h3 className="text-label font-semibold text-fg-muted">Recent calls</h3>
        {calls.length > 0 && <span className="text-label text-fg-subtle">click to inspect</span>}
      </div>
      <div className="overflow-hidden rounded-panel border border-line">
        {calls.length === 0 && (
          <p className="px-3 py-5.5 text-center text-control text-fg-subtle">
            Not called in this session yet
          </p>
        )}
        {calls.map(({ request: r, state, share }) => {
          const stream = isStreamRequest(r);
          const total = r.timing?.total;
          const tone = total === undefined ? "normal" : durationTone(total, slowMs);
          return (
            <button
              key={r.id}
              type="button"
              onClick={() => onOpen(r.id)}
              className="grid h-8 w-full cursor-pointer grid-cols-[92px_8px_44px_minmax(0,1fr)_58px] items-center gap-2.5 border-b border-line px-3 text-left font-mono text-label tabular-nums last:border-b-0 hover:bg-raised focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand"
            >
              <span className="text-fg-subtle">{formatAbsoluteTime(r.startedAt)}</span>
              <Dot tone={STATE_META[state].tone} className="size-1.75" />
              <span
                className={cn(
                  isFailedState(state) ? "text-err" : state === "pending" ? "text-warn" : "text-ok",
                  state === "aborted" && "text-fg-subtle",
                )}
              >
                {codeLabel(r, state)}
              </span>
              <span className="h-1 overflow-hidden rounded-[2px] bg-raised">
                <span
                  className={cn("block h-full", stream ? "bg-brand-dim" : BAR_FILL[tone])}
                  style={{ width: `${share * 100}%` }}
                />
              </span>
              <span className={cn("text-right", stream ? "text-brand" : DURATION_TEXT[tone])}>
                {stream
                  ? state === "streaming"
                    ? "live"
                    : "closed"
                  : state === "pending" || total === undefined
                    ? "···"
                    : formatDuration(total)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
