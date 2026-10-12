import { Check, Minus } from "lucide-react";

import type { FilterOption } from "@/features/requests/filter-options";
import type { SelectionState } from "@/features/requests/tree-selection";
import { cn } from "@/lib/utils";
import { optionTone } from "./option-tone";

interface FilterOptionRowProps {
  option: FilterOption;
  mono: boolean;
  /** Show the value's whole label and no indent, as a search lists it */
  flat: boolean;
  state: SelectionState;
  onToggle: () => void;
  onOnly: () => void;
}

/* How far each level of a tree of values is indented. */
const INDENT_REM = 0.875;

/**
 * A value in a filter's menu: a box to tick, its colour, its name, "only"
 * to choose it alone, and how many requests choosing it would show. A value
 * of a tree is indented by its depth and shows its own name, its box mixed
 * while only some of what is under it is chosen.
 *
 * @param props - The value, how much of it is chosen, and what chooses it
 * @returns The row
 * @example
 * ```tsx
 * <FilterOptionRow option={option} mono={false} flat={false} state="off" onToggle={toggle} onOnly={only} />
 * ```
 */
export function FilterOptionRow({
  option,
  mono,
  flat,
  state,
  onToggle,
  onOnly,
}: FilterOptionRowProps): React.ReactNode {
  const marked = state !== "off";
  const Mark = state === "mixed" ? Minus : Check;
  return (
    <div
      className={cn(
        "group mt-0.5 flex h-8 items-center gap-2.25 rounded-[6px] px-2 hover:bg-raised pointer-coarse:h-10",
        state === "on" && "bg-brand-tint",
      )}
    >
      <label
        className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.25"
        style={flat ? undefined : { paddingLeft: `${(option.depth ?? 0) * INDENT_REM}rem` }}
        title={option.name && !flat ? option.label : undefined}
      >
        <input
          type="checkbox"
          checked={state === "on"}
          ref={(input) => {
            if (input) input.indeterminate = state === "mixed";
          }}
          onChange={onToggle}
          className="peer sr-only"
        />
        <span
          aria-hidden="true"
          className={cn(
            "flex size-3.75 shrink-0 items-center justify-center rounded-chip border text-bg transition-colors peer-focus-visible:outline-2 peer-focus-visible:outline-brand",
            marked ? "border-brand bg-brand" : "border-line-strong",
          )}
        >
          <Mark className={cn("size-2.5", marked ? "opacity-100" : "opacity-0")} />
        </span>
        <span className={cn("truncate text-control", optionTone(option.tone), mono && "font-mono")}>
          {flat ? option.label : (option.name ?? option.label)}
        </span>
      </label>
      <button
        type="button"
        onClick={onOnly}
        className="relative cursor-pointer rounded-chip px-1.25 py-0.5 text-badge text-brand opacity-55 hit-area hover:bg-brand-dim hover:opacity-100 pointer-coarse:opacity-80"
      >
        only
      </button>
      <span className="min-w-6 text-right font-mono text-badge text-fg-subtle tabular-nums">
        {option.count}
      </span>
    </div>
  );
}
