import type { LucideIcon } from "lucide-react";
import { ChevronDown, Search, X } from "lucide-react";
import { Popover } from "radix-ui";
import { useState } from "react";

import type { FilterOption } from "@/features/requests/filter-options";
import { selectionSummary } from "@/features/requests/filter-options";
import { cn } from "@/lib/utils";
import { FilterOptionRow } from "./filter-option-row";

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
 * alone, a search for long lists, and Clear and Done.
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
  const toggle = (value: string) =>
    onChange(chosen.includes(value) ? chosen.filter((v) => v !== value) : [...chosen, value]);
  return (
    <Popover.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        setQuery("");
      }}
    >
      <div className="relative flex">
        <Popover.Trigger
          className={cn(
            "flex h-7 cursor-pointer items-center gap-1.5 rounded-control border pr-1.75 pl-2.25 text-small whitespace-nowrap transition-colors hover:border-line-strong focus-visible:outline-2 focus-visible:outline-brand",
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
            className="absolute top-1/2 right-1 flex size-4 -translate-y-1/2 cursor-pointer items-center justify-center rounded-chip text-fg-muted hover:bg-raised hover:text-fg"
          >
            <X aria-hidden="true" className="size-2.75" />
          </button>
        )}
      </div>
      <Popover.Portal>
        <Popover.Content
          data-shell=""
          align="start"
          sideOffset={6}
          className="z-50 w-68 animate-pop-in overflow-hidden rounded-[11px] bg-panel shadow-overlay"
        >
          <div className="flex items-center justify-between px-3 pt-2.5 pb-2">
            <span className="text-small font-semibold">{label}</span>
            <span className="text-badge text-fg-subtle tabular-nums">{options.length} values</span>
          </div>
          {options.length > SEARCH_FROM && (
            <div className="px-2 pb-1.5">
              <label className="flex h-7.5 items-center gap-2 rounded-control border border-line bg-inset px-2.25">
                <Search aria-hidden="true" className="size-3 text-fg-subtle" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={`Search ${label.toLowerCase()}…`}
                  aria-label={`Search ${label.toLowerCase()}`}
                  className="min-w-0 flex-1 bg-transparent text-control text-fg outline-none placeholder:text-fg-subtle"
                />
              </label>
            </div>
          )}
          <div className="max-h-66 overflow-auto border-t border-line px-1 pb-1">
            {shown.map((option) => (
              <FilterOptionRow
                key={option.value}
                option={option}
                mono={mono}
                on={chosen.includes(option.value)}
                onToggle={() => toggle(option.value)}
                onOnly={() => onChange([option.value])}
              />
            ))}
            {shown.length === 0 && (
              <p className="m-0 px-2 py-4.5 text-center text-small text-fg-subtle">
                No {label.toLowerCase()} match “{query}”
              </p>
            )}
          </div>
          <div className="flex h-10 items-center gap-2 border-t border-line bg-panel-subtle pr-2 pl-3">
            <span className="text-label text-fg-subtle">
              {active ? `${chosen.length} selected` : `Any ${label.toLowerCase()}`}
            </span>
            <span className="flex-1" />
            <button
              type="button"
              onClick={() => onChange([])}
              className="h-6.5 cursor-pointer rounded-[6px] px-2.25 text-small text-fg-muted hover:bg-raised hover:text-fg"
            >
              Clear
            </button>
            <Popover.Close className="h-6.5 cursor-pointer rounded-[6px] bg-fg px-2.75 text-small font-semibold text-bg">
              Done
            </Popover.Close>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
