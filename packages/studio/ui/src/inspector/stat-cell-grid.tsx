import { TONE_TEXT } from "@/design/tone";
import type { StatCell } from "@/features/requests/stat-cells";
import { cn } from "@/lib/utils";

/**
 * The four figures over the inspector's tabs, side by side.
 *
 * @param props - The cells
 * @returns The grid
 * @example
 * ```tsx
 * <StatCellGrid cells={statCellsOf(request, context)} />
 * ```
 */
export function StatCellGrid({ cells }: { cells: readonly StatCell[] }): React.ReactNode {
  return (
    <dl className="m-0 grid grid-cols-[minmax(0,1.3fr)_repeat(3,minmax(0,1fr))] gap-px overflow-hidden rounded-panel border border-line bg-line">
      {cells.map((cell) => (
        <div
          key={cell.label}
          className="flex min-w-0 flex-col gap-1 bg-inset px-2.75 pt-2.25 pb-2.5"
        >
          <dt className="text-meta text-fg-subtle">{cell.label}</dt>
          <dd
            className={cn(
              "m-0 flex items-center gap-1.5 overflow-hidden text-ui tracking-[-0.01em] whitespace-nowrap",
              cell.mono ? "font-mono font-medium" : "font-semibold",
              TONE_TEXT[cell.tone],
            )}
          >
            {cell.value}
          </dd>
          {cell.sub !== undefined && (
            <dd className="m-0 truncate text-badge text-fg-subtle">{cell.sub || " "}</dd>
          )}
        </div>
      ))}
    </dl>
  );
}
