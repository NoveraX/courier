import { TONE_TEXT } from "@/design/tone";
import { successHealth } from "@/features/analytics/health";
import type { StatusGroup, StatusGroupKey } from "@/features/analytics/status-breakdown";
import { cn } from "@/lib/utils";
import { ChartPanel } from "./chart-panel";

/* Each group's colour, as a CSS colour: the ring is a conic gradient of them. */
const GROUP_COLOR: Readonly<Record<StatusGroupKey, string>> = {
  success: "var(--color-ok)",
  client: "var(--color-warn)",
  server: "var(--color-err)",
  validation: "var(--color-syntax-keyword)",
  aborted: "var(--color-fg-subtle)",
  other: "color-mix(in srgb, var(--color-err) 55%, var(--color-fg-subtle))",
};

function percent(share: number): string {
  return `${(share * 100).toFixed(1)}%`;
}

function ringOf(groups: readonly StatusGroup[]): string {
  let from = 0;
  const stops = groups.flatMap((group) => {
    if (group.count === 0) return [];
    const to = from + group.share * 100;
    const stop = `${GROUP_COLOR[group.key]} ${from}% ${to}%`;
    from = to;
    return [stop];
  });
  return stops.length > 0 ? `conic-gradient(${stops.join(", ")})` : "var(--color-raised)";
}

interface StatusChartProps {
  groups: readonly StatusGroup[];
  /** How many calls finished, which the shares are of. */
  total: number;
  /** The share that succeeded, 0–100, shown in the ring. */
  successRate: number;
}

/**
 * How the calls ended: a ring of the groups' shares with the success rate
 * in its middle, and a row a group with its count, share and bar.
 *
 * @param props - The groups, the calls they are of, and the success rate
 * @returns The chart
 * @example
 * ```tsx
 * <StatusChart groups={statusBreakdown(win.done)} total={win.done.length} successRate={91.9} />
 * ```
 */
export function StatusChart({ groups, total, successRate }: StatusChartProps): React.ReactNode {
  const summary = groups.map((g) => `${g.label}: ${g.count} (${percent(g.share)})`).join(", ");
  return (
    <ChartPanel
      title="Status"
      note="breakdown"
      summary={`How ${total} completed requests ended. ${summary}.`}
      aside={
        <span className="font-mono text-badge whitespace-nowrap text-fg-subtle">
          {total} completed
        </span>
      }
    >
      <div className="flex flex-1 items-center gap-5.5">
        <div
          className="relative size-34 shrink-0 rounded-full"
          style={{ background: ringOf(groups) }}
        >
          <div className="absolute inset-4.25 flex flex-col items-center justify-center gap-0.75 rounded-full bg-panel">
            <span
              className={cn(
                "font-mono text-page font-medium tracking-[-0.03em]",
                TONE_TEXT[successHealth(successRate)],
              )}
            >
              {successRate.toFixed(1)}%
            </span>
            <span className="text-badge text-fg-subtle">success</span>
          </div>
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          {groups.map((group) => (
            <div key={group.key} className="flex flex-col gap-1.25 py-1.25">
              <div className="flex items-center gap-2 text-control">
                <span
                  className="size-2 shrink-0 rounded-[2px]"
                  style={{ background: GROUP_COLOR[group.key] }}
                />
                <span className="truncate text-fg-muted">{group.label}</span>
                <div className="flex-1" />
                <span className="font-mono text-small tabular-nums">{group.count}</span>
                <span className="min-w-10 text-right font-mono text-badge text-fg-subtle tabular-nums">
                  {percent(group.share)}
                </span>
              </div>
              <div className="h-0.75 overflow-hidden rounded-[2px] bg-raised">
                <span
                  className="block h-full"
                  style={{ width: percent(group.share), background: GROUP_COLOR[group.key] }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </ChartPanel>
  );
}
