import type { LucideIcon } from "lucide-react";
import { Download, ListFilter, Pause, Play, Trash2 } from "lucide-react";

import { MEDIA } from "@/design/breakpoints";
import { ChoiceMenu } from "@/design/choice-menu";
import { OverflowMenu } from "@/design/overflow-menu";
import { SearchField } from "@/design/search-field";
import type { SegmentedOption } from "@/design/segmented";
import { Segmented } from "@/design/segmented";
import type { LogFilter } from "@/features/mocks/logs-view";
import { useMediaQuery } from "@/hooks/use-media-query";
import { cn } from "@/lib/utils";

/* A phone, upright or held sideways, has no room for the filters and the actions as buttons. */
const COMPACT = `${MEDIA.phone}, ${MEDIA.shortScreen}`;

interface LogsToolbarProps {
  /** Each filter, with how many requests it shows. */
  filters: readonly SegmentedOption<LogFilter>[];
  show: LogFilter;
  onShow: (filter: LogFilter) => void;
  q: string;
  onSearch: (q: string) => void;
  paused: boolean;
  onPause: () => void;
  onExport: () => void;
  onClear: () => void;
}

function ToolButton({
  icon: Icon,
  label,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
}): React.ReactNode {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-7 cursor-pointer items-center gap-1.5 rounded-control border border-line px-2.5 text-small text-fg-muted hover:border-line-strong hover:text-fg pointer-coarse:h-9"
    >
      <Icon aria-hidden="true" className="size-3" />
      {label}
    </button>
  );
}

/**
 * The bar over a mock's log: the filters with their counts, the search,
 * and Pause, Export and Clear. On a phone, upright or held sideways, it
 * keeps to one row — the search takes the width, the filter is picked from
 * a menu that names its count, and Pause, Export and Clear are in a "⋯"
 * menu — or to two on the narrowest, where the search has a row of its own.
 *
 * @param props - The filters and the one shown, the search, whether the log is paused, and what each action does
 * @returns The bar
 * @example
 * ```tsx
 * <LogsToolbar filters={filters} show="all" onShow={narrow} q="" onSearch={search} paused={false} onPause={toggle} onExport={save} onClear={clear} />
 * ```
 */
export function LogsToolbar(props: LogsToolbarProps): React.ReactNode {
  const { filters, show, onShow, q, onSearch, paused, onPause, onExport, onClear } = props;
  const compact = useMediaQuery(COMPACT);
  const pause = { label: paused ? "Resume" : "Pause", icon: paused ? Play : Pause };
  const search = (
    <SearchField
      label="Search the log"
      placeholder="Path or endpoint"
      value={q}
      onChange={onSearch}
      className={compact ? "min-w-32 flex-1" : "w-60"}
    />
  );
  return (
    <div
      className={cn(
        "flex shrink-0 flex-wrap items-center gap-2.5 border-b border-line bg-bg px-5 py-2.5",
        compact && "gap-2 py-1.5 max-sm:px-4",
      )}
    >
      {compact ? (
        <>
          {search}
          <div className="ml-auto flex shrink-0 items-center gap-2">
            <ChoiceMenu
              icon={ListFilter}
              label="Show"
              choices={filters.map((filter) => ({
                value: filter.value,
                label: `${filter.label} · ${filter.count ?? 0}`,
              }))}
              value={show}
              onChange={onShow}
            />
            <OverflowMenu
              label="More for this log"
              actions={[
                { key: "pause", ...pause, onSelect: onPause },
                { key: "export", label: "Export", icon: Download, onSelect: onExport },
                { key: "clear", label: "Clear", icon: Trash2, onSelect: onClear, tone: "danger" },
              ]}
            />
          </div>
        </>
      ) : (
        <>
          <Segmented label="Show" quiet="subtle" options={filters} value={show} onChange={onShow} />
          {search}
          <div className="flex-1" />
          <ToolButton icon={pause.icon} label={pause.label} onClick={onPause} />
          <ToolButton icon={Download} label="Export" onClick={onExport} />
          <ToolButton icon={Trash2} label="Clear" onClick={onClear} />
        </>
      )}
    </div>
  );
}
