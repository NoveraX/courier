import type { LucideIcon } from "lucide-react";
import { Hourglass, OctagonX, ShieldAlert, Zap } from "lucide-react";

import type { ExperimentLine } from "@/features/mocks/experiment-log";
import { runLength } from "@/features/mocks/experiment-log";
import { formatRelativeTime } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import type { MockServerInfo } from "@/store/mock-slice";
import { NetworkCard } from "./network-card";
import { StopLimits } from "./stop-limits";

const EVENT: Readonly<
  Record<ExperimentLine["type"], { label: string; icon: LucideIcon; tone: string }>
> = {
  started: { label: "Started", icon: Zap, tone: "text-brand" },
  stopped: { label: "Stopped", icon: OctagonX, tone: "text-ok" },
  "auto-halted": { label: "Auto-halted", icon: Hourglass, tone: "text-warn" },
};

/**
 * What keeps a chaos run safe: thresholds that halt it on their own, and
 * the log of the mock's runs — each start, stop and halt, with how long a
 * run lasted — side by side, or the log under the thresholds in a card too
 * narrow for both.
 *
 * @param props - The mock server, its log, the time now, and whether it can take a change
 * @returns The panel
 * @example
 * ```tsx
 * <SafetyPanel server={server} lines={experimentLog(history, server.serverId)} now={now} disabled={false} />
 * ```
 */
export function SafetyPanel({
  server,
  lines,
  now,
  disabled,
}: {
  server: MockServerInfo;
  lines: readonly ExperimentLine[];
  now: number;
  disabled: boolean;
}): React.ReactNode {
  return (
    <NetworkCard
      icon={ShieldAlert}
      tone="text-warn"
      title="Safety"
      note="halt a run on its own, and what ran"
    >
      <div className="@container">
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(320px,100%),1fr))]">
          <StopLimits server={server} disabled={disabled} />
          <section
            aria-label="Runs"
            className="flex max-h-75 min-w-0 flex-col overflow-y-auto border-l border-line @max-[40rem]:border-t @max-[40rem]:border-l-0"
          >
            {lines.length === 0 && (
              <p className="m-auto px-4.5 py-6 text-center text-control text-fg-subtle">
                No runs yet — pick a chaos mode or a delay to start one
              </p>
            )}
            {lines.map((line) => {
              const look = EVENT[line.type];
              return (
                <div
                  key={line.id}
                  className="flex items-start gap-3 border-b border-line px-4.5 py-2.5"
                >
                  <look.icon
                    aria-hidden="true"
                    className={cn("mt-0.5 size-3.5 shrink-0", look.tone)}
                  />
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="text-small font-medium">
                      {look.label} · <span className="font-mono">{line.mode}</span>
                    </span>
                    {line.reason && (
                      <span className="truncate text-badge text-warn">{line.reason}</span>
                    )}
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-0.5 text-badge text-fg-subtle">
                    <span>{formatRelativeTime(line.at, now)}</span>
                    {line.ranMs !== undefined && (
                      <span className="font-mono">ran {runLength(line.ranMs)}</span>
                    )}
                  </span>
                </div>
              );
            })}
          </section>
        </div>
      </div>
    </NetworkCard>
  );
}
