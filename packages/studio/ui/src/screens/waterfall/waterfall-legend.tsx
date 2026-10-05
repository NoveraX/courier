import { cn } from "@/lib/utils";
import { LEGEND_SEGMENTS, SEGMENT_STYLE } from "./segment-style";

/**
 * The key under the Waterfall: the colour of each part of a bar, and how
 * an idle gap is drawn.
 *
 * @returns The legend
 * @example
 * ```tsx
 * <WaterfallLegend />
 * ```
 */
export function WaterfallLegend(): React.ReactNode {
  return (
    <div className="flex min-h-8.5 shrink-0 flex-wrap items-center gap-x-3.5 gap-y-1.5 border-t border-line bg-bg-subtle py-2 pr-4 pl-5">
      {LEGEND_SEGMENTS.map((key) => (
        <span
          key={key}
          className="flex items-center gap-1.5 text-label whitespace-nowrap text-fg-muted"
        >
          <span
            aria-hidden="true"
            className={cn("h-2 w-3.5 rounded-[2px]", SEGMENT_STYLE[key].fill)}
          />
          {SEGMENT_STYLE[key].label}
        </span>
      ))}
      <span className="flex items-center gap-1.5 text-label whitespace-nowrap text-fg-muted">
        <span
          aria-hidden="true"
          className="h-2 w-3.5 rounded-[2px] border border-dashed border-line-strong bg-[repeating-linear-gradient(135deg,var(--color-line-strong)_0_1px,transparent_1px_4px)]"
        />
        Idle gap
      </span>
    </div>
  );
}
