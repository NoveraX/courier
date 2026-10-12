import { Link } from "@tanstack/react-router";

import { CardSection } from "@/design/card-section";
import { methodText } from "@/design/method-color";
import { TONE_TEXT } from "@/design/tone";
import { shortAgo } from "@/features/explorer/endpoint-key";
import { mockLogCode, mockLogTone } from "@/features/mocks/mock-log";
import { durationTone } from "@/features/requests/duration-tone";
import { inspectorOf } from "@/features/requests/inspector-of";
import { formatDuration } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import type { MockRequestLog } from "@/store/mock-slice";

/* How many of the newest answers the card lists. */
const SHOWN = 14;
const DURATION_TEXT = { normal: "text-fg-muted", warn: "text-warn", err: "text-err" } as const;

/* A card too narrow for the five columns gives each answer two lines: the method, path and
   status over when it came and how long it took. Every row keeps its full height where the
   list would squeeze it, and the list scrolls instead. */
const ROW =
  "grid h-8 w-full shrink-0 cursor-pointer grid-cols-[64px_44px_minmax(0,1fr)_40px_56px] items-center gap-2.5 rounded-control px-2.5 text-left font-mono text-label tabular-nums hover:bg-raised pointer-coarse:h-11 @max-[25rem]:h-11 @max-[25rem]:grid-cols-[40px_minmax(0,1fr)_auto] @max-[25rem]:content-center @max-[25rem]:gap-x-2 @max-[25rem]:gap-y-0.5";
const CELL = {
  when: "whitespace-nowrap text-fg-subtle @max-[25rem]:col-[1/3] @max-[25rem]:row-start-2",
  method: "text-micro font-semibold @max-[25rem]:col-start-1 @max-[25rem]:row-start-1",
  path: "truncate @max-[25rem]:col-start-2 @max-[25rem]:row-start-1",
  status: "@max-[25rem]:col-start-3 @max-[25rem]:row-start-1 @max-[25rem]:text-right",
  duration: "text-right @max-[25rem]:col-start-3 @max-[25rem]:row-start-2",
} as const;

interface LiveActivityProps {
  logs: readonly MockRequestLog[];
  running: boolean;
  now: number;
  slowMs: number;
  /** Opens a request's sheet. */
  onOpen: (id: string) => void;
}

/**
 * The mock server's newest answers as they come: when, how each went, the
 * method and path, the status and how long it took — each opening its
 * request's sheet. In a narrow card each answer takes two lines, so its
 * path keeps the room it needs.
 *
 * @param props - The server's logged requests, whether it runs, the time, the slow threshold, and what opens a request
 * @returns The card
 * @example
 * ```tsx
 * <LiveActivity logs={logs} running now={now} slowMs={500} onOpen={open} />
 * ```
 */
export function LiveActivity({
  logs,
  running,
  now,
  slowMs,
  onOpen,
}: LiveActivityProps): React.ReactNode {
  const latest = logs.slice(0, SHOWN);
  return (
    <CardSection
      title="Live activity"
      aside={
        <>
          <span
            className={cn(
              "flex items-center gap-1.5 text-label",
              running ? "text-ok" : "text-fg-subtle",
            )}
          >
            {running ? "running" : "stopped"}
          </span>
          <div className="flex-1" />
          <Link
            from="/mocks"
            to="/mocks/logs"
            search={(prev) => ({ ...inspectorOf(prev) })}
            className="flex h-6.5 items-center rounded-[6px] px-2 text-small text-fg-subtle hover:bg-raised hover:text-fg pointer-coarse:h-9"
          >
            All logs →
          </Link>
        </>
      }
    >
      <div className="@container flex max-h-95 flex-col overflow-auto p-1.5">
        {latest.length === 0 && (
          <p className="p-7 text-center text-control text-fg-subtle">
            {running
              ? "No requests yet — call an endpoint the mock serves"
              : "Server is stopped — start it to receive traffic"}
          </p>
        )}
        {latest.map((log, index) => {
          const tone = mockLogTone(log);
          return (
            <button
              type="button"
              key={log.id}
              onClick={() => onOpen(log.id)}
              className={cn(ROW, index === 0 && running && "bg-brand-tint")}
            >
              <span className={CELL.when}>
                {now - log.timestamp < 1_000 ? "now" : shortAgo(now - log.timestamp)}
              </span>
              <span className={cn(CELL.method, methodText(log.httpMethod.toUpperCase()))}>
                {log.httpMethod.toUpperCase()}
              </span>
              <span className={CELL.path}>{log.path}</span>
              <span className={cn(CELL.status, TONE_TEXT[tone])}>{mockLogCode(log)}</span>
              <span
                className={cn(
                  CELL.duration,
                  log.duration === undefined
                    ? "text-fg-subtle"
                    : DURATION_TEXT[durationTone(log.duration, slowMs)],
                )}
              >
                {log.duration === undefined ? "—" : formatDuration(log.duration)}
              </span>
            </button>
          );
        })}
      </div>
    </CardSection>
  );
}
