import { Link } from "@tanstack/react-router";

import { CardSection } from "@/design/card-section";
import { Dot } from "@/design/dot";
import { methodText } from "@/design/method-color";
import { TONE_TEXT } from "@/design/tone";
import { shortAgo } from "@/features/explorer/endpoint-key";
import { mockLogCode, mockLogTone } from "@/features/mocks/mock-log";
import { durationTone } from "@/features/requests/duration-tone";
import { formatDuration } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import type { MockRequestLog } from "@/store/mock-slice";

/* How many of the newest answers the card lists. */
const SHOWN = 14;
const DURATION_TEXT = { normal: "text-fg-muted", warn: "text-warn", err: "text-err" } as const;

interface LiveActivityProps {
  logs: readonly MockRequestLog[];
  running: boolean;
  now: number;
  slowMs: number;
}

/**
 * The mock server's newest answers as they come: when, how each went, the
 * method and path, the status and how long it took.
 *
 * @param props - The server's logged requests, whether it runs, the time and the slow threshold
 * @returns The card
 * @example
 * ```tsx
 * <LiveActivity logs={logs} running now={now} slowMs={500} />
 * ```
 */
export function LiveActivity({ logs, running, now, slowMs }: LiveActivityProps): React.ReactNode {
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
            <Dot tone="current" pulse={running} />
            {running ? "running" : "stopped"}
          </span>
          <div className="flex-1" />
          <Link
            to="/mocks/logs"
            className="flex h-6.5 items-center rounded-[6px] px-2 text-small text-fg-subtle hover:bg-raised hover:text-fg"
          >
            All logs →
          </Link>
        </>
      }
    >
      <div className="flex max-h-95 flex-col overflow-auto p-1.5">
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
            <div
              key={log.id}
              className={cn(
                "grid h-8 grid-cols-[64px_8px_44px_minmax(0,1fr)_40px_56px] items-center gap-2.5 rounded-control px-2.5 font-mono text-label tabular-nums hover:bg-raised",
                index === 0 && running && "bg-brand-tint",
              )}
            >
              <span className="whitespace-nowrap text-fg-subtle">
                {now - log.timestamp < 1_000 ? "now" : shortAgo(now - log.timestamp)}
              </span>
              <Dot tone={tone} className="size-1.75" />
              <span
                className={cn("text-micro font-semibold", methodText(log.httpMethod.toUpperCase()))}
              >
                {log.httpMethod.toUpperCase()}
              </span>
              <span className="truncate">{log.path}</span>
              <span className={TONE_TEXT[tone]}>{mockLogCode(log)}</span>
              <span
                className={cn(
                  "text-right",
                  log.duration === undefined
                    ? "text-fg-subtle"
                    : DURATION_TEXT[durationTone(log.duration, slowMs)],
                )}
              >
                {log.duration === undefined ? "—" : formatDuration(log.duration)}
              </span>
            </div>
          );
        })}
      </div>
    </CardSection>
  );
}
