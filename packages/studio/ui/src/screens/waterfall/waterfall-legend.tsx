import { cn } from "@/lib/utils";
import { LEGEND_SEGMENTS, SEGMENT_STYLE, WEBHOOK_LEGEND_SEGMENTS } from "./segment-style";

/**
 * The key under the Waterfall: the colour of each part of a bar — a
 * webhook's checks and handler too while one is in view — and how an idle
 * gap is drawn. On a phone it is one row, which scrolls sideways.
 *
 * @param props - Whether a webhook delivered to the app is in view
 * @returns The legend
 * @example
 * ```tsx
 * <WaterfallLegend webhooks={false} />
 * ```
 */
export function WaterfallLegend({ webhooks }: { webhooks: boolean }): React.ReactNode {
  const segments = webhooks ? [...LEGEND_SEGMENTS, ...WEBHOOK_LEGEND_SEGMENTS] : LEGEND_SEGMENTS;
  return (
    <div className="flex min-h-8.5 shrink-0 flex-wrap items-center gap-x-3.5 gap-y-1.5 border-t border-line bg-bg-subtle py-2 pr-4 pl-5 max-sm:scroll-row max-sm:flex-nowrap max-sm:pl-4 short-screen:min-h-7 short-screen:py-1.5">
      {segments.map((key) => (
        <span
          key={key}
          className="flex shrink-0 items-center gap-1.5 text-label whitespace-nowrap text-fg-muted"
        >
          <span
            aria-hidden="true"
            className={cn("h-2 w-3.5 rounded-[2px]", SEGMENT_STYLE[key].fill)}
          />
          {SEGMENT_STYLE[key].label}
        </span>
      ))}
      <span className="flex shrink-0 items-center gap-1.5 text-label whitespace-nowrap text-fg-muted">
        <span
          aria-hidden="true"
          className="h-2 w-3.5 rounded-[2px] border border-dashed border-line-strong bg-[repeating-linear-gradient(135deg,var(--color-line-strong)_0_1px,transparent_1px_4px)]"
        />
        Idle gap
      </span>
    </div>
  );
}
