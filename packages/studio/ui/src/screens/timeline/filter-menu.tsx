import type { LucideIcon } from "lucide-react";
import { ChevronDown, X } from "lucide-react";
import { Popover } from "radix-ui";
import { useState } from "react";
import { focusOnClose } from "@/design/focus-on-close";
import { POP_MOTION } from "@/design/overlay-motion";
import type { FilterOption } from "@/features/requests/filter-options";
import { selectionSummary } from "@/features/requests/filter-options";
import { selectionState, toggleValues } from "@/features/requests/tree-selection";
import { cn } from "@/lib/utils";
import { FilterOptionRow } from "./filter-option-row";
import { FilterSearch } from "./filter-search";

interface FilterMenuProps {
  label: string;
  icon: LucideIcon;
  mono: boolean;
  options: readonly FilterOption[];
  chosen: readonly string[];
  onChange: (chosen: string[]) => void;
}

/* Long lists get a search; short ones show at a glance. */
const SEARCH_FROM = 8;

/**
 * A filter's button and the menu it opens: every value with how many
 * requests choosing it would show, a box to tick, "only" to choose it
 * alone, a search for long lists, and Clear and Done. A value of a tree —
 * a group with groups inside it — chooses everything under it, and shows
 * a mixed box while only some of that is chosen.
 *
 * @param props - The filter's name, icon and values, the ones chosen, and what changes them
 * @returns The button and its menu
 * @example
 * ```tsx
 * <FilterMenu label="Method" icon={ArrowRightLeft} mono options={options} chosen={["GET"]} onChange={set} />
 * ```
 */
export function FilterMenu({
  label,
  icon: Icon,
  mono,
  options,
  chosen,
  onChange,
}: FilterMenuProps): React.ReactNode {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const active = chosen.length > 0;
  const shown = query
    ? options.filter((o) => o.label.toLowerCase().includes(query.toLowerCase()))
    : options;
  const valuesOf = (option: FilterOption) => option.subtree ?? [option.value];
  return (
    <Popover.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        setQuery("");
      }}
    >
      <div className="relative flex shrink-0">
        <Popover.Trigger
          className={cn(
            "flex h-7 cursor-pointer items-center gap-1.5 rounded-control border pr-1.75 pl-2.25 text-small whitespace-nowrap transition-colors hover:border-line-strong focus-visible:outline-2 focus-visible:outline-brand pointer-coarse:h-9",
            active
              ? "border-solid border-brand/45 bg-brand-dim pr-6 text-brand"
              : "border-dashed border-line-strong text-fg-muted",
            open && !active && "bg-raised",
          )}
        >
          <Icon aria-hidden="true" className="size-3 opacity-75" />
          <span className="font-strong">{label}</span>
          {active ? (
            <>
              <span aria-hidden="true" className="h-3 w-px bg-current opacity-25" />
              <span className={cn("max-w-37.5 truncate text-label text-fg", mono && "font-mono")}>
                {selectionSummary(options, chosen)}
              </span>
            </>
          ) : (
            <ChevronDown aria-hidden="true" className="size-3 opacity-50" />
          )}
        </Popover.Trigger>
        {active && (
          <button
            type="button"
            title={`Clear ${label.toLowerCase()}`}
            aria-label={`Clear ${label.toLowerCase()}`}
            onClick={() => onChange([])}
            className="absolute top-1/2 right-1 flex size-4 -translate-y-1/2 cursor-pointer items-center justify-center rounded-chip text-fg-muted hit-area hover:bg-raised hover:text-fg"
          >
            <X aria-hidden="true" className="size-2.75" />
          </button>
        )}
      </div>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={6}
          collisionPadding={8}
          onCloseAutoFocus={focusOnClose}
          className={cn(
            "z-50 flex max-h-(--radix-popover-content-available-height) w-68 max-w-[calc(100vw-16px)] flex-col overflow-hidden rounded-[11px] bg-panel shadow-overlay",
            POP_MOTION,
          )}
        >
          <div className="flex shrink-0 items-center justify-between px-3 pt-2.5 pb-2">
            <span className="text-small font-semibold">{label}</span>
            <span className="text-badge text-fg-subtle tabular-nums">{options.length} values</span>
          </div>
          {options.length > SEARCH_FROM && (
            <FilterSearch value={query} onChange={setQuery} label={label} />
          )}
          <div className="max-h-66 min-h-0 overflow-auto border-t border-line px-1 pb-1">
            {shown.map((option) => (
              <FilterOptionRow
                key={option.value}
                option={option}
                mono={mono}
                flat={query !== ""}
                state={selectionState(chosen, valuesOf(option))}
                onToggle={() => onChange(toggleValues(chosen, valuesOf(option)))}
                onOnly={() => onChange([...valuesOf(option)])}
              />
            ))}
            {shown.length === 0 && (
              <p className="m-0 px-2 py-4.5 text-center text-small text-fg-subtle">
                No {label.toLowerCase()} match “{query}”
              </p>
            )}
          </div>
          <div className="flex h-10 shrink-0 items-center gap-2 border-t border-line bg-panel-subtle pr-2 pl-3 pointer-coarse:h-12">
            <span className="text-label text-fg-subtle">
              {active ? `${chosen.length} selected` : `Any ${label.toLowerCase()}`}
            </span>
            <span className="flex-1" />
            <button
              type="button"
              onClick={() => onChange([])}
              className="h-6.5 cursor-pointer rounded-[6px] px-2.25 text-small text-fg-muted hover:bg-raised hover:text-fg pointer-coarse:h-9 pointer-coarse:px-3"
            >
              Clear
            </button>
            <Popover.Close className="h-6.5 cursor-pointer rounded-[6px] bg-fg px-2.75 text-small font-semibold text-bg pointer-coarse:h-9 pointer-coarse:px-3.5">
              Done
            </Popover.Close>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
