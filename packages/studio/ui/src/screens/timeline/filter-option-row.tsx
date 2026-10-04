import { Check } from "lucide-react";

import type { FilterOption } from "@/features/requests/filter-options";
import { cn } from "@/lib/utils";
import { SwatchDot } from "./swatch-dot";

interface FilterOptionRowProps {
  option: FilterOption;
  mono: boolean;
  on: boolean;
  onToggle: () => void;
  onOnly: () => void;
}

/**
 * A value in a filter's menu: a box to tick, its colour, its name, "only"
 * to choose it alone, and how many requests choosing it would show.
 *
 * @param props - The value, whether it is chosen, and what chooses it
 * @returns The row
 * @example
 * ```tsx
 * <FilterOptionRow option={option} mono={false} on={false} onToggle={toggle} onOnly={only} />
 * ```
 */
export function FilterOptionRow({
  option,
  mono,
  on,
  onToggle,
  onOnly,
}: FilterOptionRowProps): React.ReactNode {
  return (
    <div
      className={cn(
        "group mt-0.5 flex h-8 items-center gap-2.25 rounded-[6px] px-2 hover:bg-raised",
        on && "bg-brand-tint",
      )}
    >
      <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.25">
        <input type="checkbox" checked={on} onChange={onToggle} className="peer sr-only" />
        <span
          aria-hidden="true"
          className={cn(
            "flex size-3.75 shrink-0 items-center justify-center rounded-chip border text-bg transition-colors peer-focus-visible:outline-2 peer-focus-visible:outline-brand",
            on ? "border-brand bg-brand" : "border-line-strong",
          )}
        >
          <Check className={cn("size-2.5", on ? "opacity-100" : "opacity-0")} />
        </span>
        {option.swatch && <SwatchDot swatch={option.swatch} />}
        <span className={cn("truncate text-control text-fg", mono && "font-mono")}>
          {option.label}
        </span>
      </label>
      <button
        type="button"
        onClick={onOnly}
        className="cursor-pointer rounded-chip px-1.25 py-0.5 text-badge text-brand opacity-55 hover:bg-brand-dim hover:opacity-100"
      >
        only
      </button>
      <span className="min-w-6 text-right font-mono text-badge text-fg-subtle tabular-nums">
        {option.count}
      </span>
    </div>
  );
}
