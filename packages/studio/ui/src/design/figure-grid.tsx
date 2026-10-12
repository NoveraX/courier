import type { LucideIcon } from "lucide-react";

import type { Tone } from "@/design/tone";
import { TONE_TEXT } from "@/design/tone";
import { cn } from "@/lib/utils";

/** One figure of a grid: what it counts, its value, a line under it and the tone it reads in. */
export interface Figure {
  key: string;
  icon: LucideIcon;
  label: string;
  value: string;
  sub: string;
  tone: Tone;
  /** A word rather than a number is set in the text face. */
  text?: boolean | undefined;
}

/**
 * A page's key figures in one grid — six across a wide window, three or
 * two on a narrower one — each with its icon, label, value and a line of
 * context; on a phone the values a size smaller and the cells a touch
 * tighter, so a word fits its cell.
 *
 * @param props - The figures, and what the grid is called
 * @returns The grid
 * @example
 * ```tsx
 * <FigureGrid label="Figures" figures={[{ key: "routes", icon: Route, label: "Routes", value: "16", sub: "5 custom", tone: "normal" }]} />
 * ```
 */
export function FigureGrid({
  figures,
  label,
}: {
  figures: readonly Figure[];
  label: string;
}): React.ReactNode {
  return (
    <section
      aria-label={label}
      className="grid grid-cols-2 gap-px overflow-hidden rounded-sheet border border-line bg-line min-[701px]:grid-cols-3 min-[1360px]:grid-cols-6"
    >
      {figures.map((figure) => {
        const Icon = figure.icon;
        return (
          <div
            key={figure.key}
            className="flex min-w-0 flex-col gap-2 bg-panel px-4 py-3.5 max-sm:px-3.5"
          >
            <span className="flex items-center gap-1.75 text-small whitespace-nowrap text-fg-muted">
              <Icon aria-hidden="true" className="size-3 text-fg-subtle" />
              {figure.label}
            </span>
            <span
              className={cn(
                "truncate text-kpi leading-none font-medium tracking-[-0.035em] tabular-nums max-sm:text-stat",
                !figure.text && "font-mono",
                TONE_TEXT[figure.tone],
              )}
            >
              {figure.value}
            </span>
            <span className="truncate text-badge text-fg-subtle">{figure.sub}</span>
          </div>
        );
      })}
    </section>
  );
}
