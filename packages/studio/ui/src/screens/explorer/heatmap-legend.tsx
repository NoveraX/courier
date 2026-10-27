import { Info } from "lucide-react";
import { Popover } from "radix-ui";

import { focusOnClose } from "@/design/focus-on-close";
import { POP_MOTION } from "@/design/overlay-motion";
import { cn } from "@/lib/utils";

interface HeatmapLegendProps {
  /** Each step of the scale, from its low end to its high one. */
  fills: readonly string[];
  /** Traffic runs from few calls to many; the other metrics from good to bad. */
  traffic: boolean;
  /** Behind a Legend button, where a phone has no room for it in the bar. */
  folded: boolean;
}

/**
 * What the heatmap's colours mean: its scale from good to bad — or, for
 * traffic, from few calls to many — and the outline of a span with no
 * calls; in the heatmap's bar, or behind a Legend button on a phone.
 *
 * @param props - The scale's fills, whether it counts traffic, and whether it sits behind a button
 * @returns The legend
 * @example
 * ```tsx
 * <HeatmapLegend fills={HEAT_FILLS.health} traffic={false} folded={phone} />
 * ```
 */
export function HeatmapLegend({ fills, traffic, folded }: HeatmapLegendProps): React.ReactNode {
  if (!folded) {
    return (
      <div className="flex items-center gap-1">
        <Scale fills={fills} traffic={traffic} />
        <NoCalls className="ml-3" />
      </div>
    );
  }
  return (
    <Popover.Root>
      <Popover.Trigger className="flex h-7.5 shrink-0 cursor-pointer items-center gap-1.5 rounded-control border border-line bg-panel px-2.5 text-control text-fg-muted transition-colors hover:border-line-strong hover:text-fg focus-visible:outline-2 focus-visible:outline-brand data-[state=open]:border-line-strong data-[state=open]:text-fg pointer-coarse:h-9">
        <Info aria-hidden="true" className="size-3.25" />
        Legend
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={6}
          collisionPadding={8}
          aria-label="Legend"
          onCloseAutoFocus={focusOnClose}
          className={cn(
            "z-50 flex flex-col gap-3 rounded-panel bg-panel p-3.5 shadow-overlay",
            POP_MOTION,
          )}
        >
          <div className="flex items-center gap-1">
            <Scale fills={fills} traffic={traffic} />
          </div>
          <NoCalls />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function Scale({ fills, traffic }: Omit<HeatmapLegendProps, "folded">): React.ReactNode {
  return (
    <>
      <span className="mr-1 text-badge text-fg-subtle">{traffic ? "few" : "good"}</span>
      {fills.map((fill) => (
        <span key={fill} className={cn("h-2.5 w-5.5 rounded-[3px]", fill)} />
      ))}
      <span className="ml-1 text-badge text-fg-subtle">{traffic ? "busy" : "bad"}</span>
    </>
  );
}

function NoCalls({ className }: { className?: string }): React.ReactNode {
  return (
    <span className={cn("flex items-center gap-1.25 text-badge text-fg-subtle", className)}>
      <span className="size-2.5 rounded-[3px] border border-line-strong" />
      no calls
    </span>
  );
}
