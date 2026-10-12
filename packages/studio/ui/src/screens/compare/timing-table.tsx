import { TONE_DIM, TONE_TEXT } from "@/design/tone";
import type { TimingRow } from "@/features/compare/timing-rows";
import { formatDuration } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import { sideText } from "./side-tag";

function Bar({
  side,
  ms,
  longest,
  tone,
}: {
  side: "a" | "b";
  ms: number;
  longest: number;
  tone: string;
}): React.ReactNode {
  return (
    <div className="flex items-center gap-2">
      <span className={cn("w-3.5 font-mono text-micro font-bold", sideText(side))}>
        {side.toUpperCase()}
      </span>
      <span className="h-2 flex-1 overflow-hidden rounded-[3px] bg-raised">
        <span
          className={cn(
            "block h-full rounded-[3px] bg-current",
            tone,
            side === "a" && "opacity-55",
          )}
          style={{ width: `${(ms / longest) * 100}%` }}
        />
      </span>
      <span
        className={cn(
          "w-14 text-right font-mono text-badge",
          side === "a" ? "text-fg-subtle" : "text-fg",
        )}
      >
        {formatDuration(ms)}
      </span>
    </div>
  );
}

/**
 * The two calls' time phase by phase: a bar for A and for B against the
 * longer whole call, and how each phase moved. In a table too narrow for
 * the three columns, the bars take the whole line under the phase and its
 * move.
 *
 * @param props - The phases
 * @returns The table
 * @example
 * ```tsx
 * <TimingTable rows={timingRows(a, b)} />
 * ```
 */
export function TimingTable({ rows }: { rows: readonly TimingRow[] }): React.ReactNode {
  const longest = Math.max(1, ...rows.map((row) => Math.max(row.a, row.b)));
  return (
    <section
      aria-label="Timing"
      className="@container flex flex-col overflow-hidden rounded-sheet border border-line bg-panel"
    >
      {rows.map((row) => (
        <div
          key={row.label}
          className="grid min-h-15 grid-cols-[130px_minmax(0,1fr)_110px] items-center gap-4 border-b border-line px-4.5 py-2 last:border-b-0 @max-[35rem]:grid-cols-[minmax(0,1fr)_auto] @max-[35rem]:gap-y-2 @max-[35rem]:py-3"
        >
          <span className="flex items-center gap-2 text-control text-fg-muted">
            <span className={cn("size-2 rounded-[2px] bg-current", row.tone)} />
            {row.label}
          </span>
          <div className="flex flex-col gap-1.25 @max-[35rem]:col-span-2 @max-[35rem]:row-start-2">
            <Bar side="a" ms={row.a} longest={longest} tone={row.tone} />
            <Bar side="b" ms={row.b} longest={longest} tone={row.tone} />
          </div>
          <span
            className={cn(
              "flex h-5.5 items-center gap-1 justify-self-end rounded-full px-2 font-mono text-badge font-semibold @max-[35rem]:col-start-2 @max-[35rem]:row-start-1",
              TONE_TEXT[row.delta.tone],
              TONE_DIM[row.delta.tone],
            )}
          >
            {row.delta.label}
          </span>
        </div>
      ))}
    </section>
  );
}
