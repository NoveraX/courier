import { Info } from "lucide-react";
import { Popover } from "radix-ui";

import { focusOnClose } from "@/design/focus-on-close";
import { POP_MOTION } from "@/design/overlay-motion";
import type { HealthLevel } from "@/features/explorer/endpoint-metrics";
import { LEVEL_META } from "@/features/explorer/endpoint-metrics";
import { cn } from "@/lib/utils";
import { LEVEL_EDGE } from "./level-edge";

const LEVELS: readonly HealthLevel[] = ["healthy", "degraded", "critical", "idle"];

const ITEM = "flex items-center gap-1.5 text-label whitespace-nowrap text-fg-muted";

/**
 * What the graph's colours mean: a card's edge for each health, and the
 * mark a live call runs as — in a row in the graph's bar, or behind a
 * Legend button where a phone has no room for it.
 *
 * @param props - Whether it sits behind a button
 * @returns The legend
 * @example
 * ```tsx
 * <GraphLegend folded={phone} />
 * ```
 */
export function GraphLegend({ folded = false }: { folded?: boolean }): React.ReactNode {
  if (!folded) return <Items className="flex-wrap items-center gap-3.5" />;
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
          className={cn("z-50 rounded-panel bg-panel p-3.5 shadow-overlay", POP_MOTION)}
        >
          <Items className="flex-col items-start gap-2.5" />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function Items({ className }: { className: string }): React.ReactNode {
  return (
    <ul aria-label="Legend" className={cn("flex", className)}>
      {LEVELS.map((level) => (
        <li key={level} className={ITEM}>
          <span
            aria-hidden="true"
            className={cn(
              "h-2.5 w-3.5 rounded-[3px] border bg-panel",
              LEVEL_EDGE[LEVEL_META[level].tone],
            )}
          />
          {LEVEL_META[level].label}
        </li>
      ))}
      <li className={ITEM}>
        <span className="relative h-px w-4.5 bg-gradient-to-r from-transparent to-brand">
          <span className="absolute top-1/2 right-0 size-1.5 -translate-y-1/2 rounded-full bg-brand shadow-[0_0_6px_var(--color-brand)]" />
        </span>
        Live call
      </li>
    </ul>
  );
}
