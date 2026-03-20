import { Pin } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { useDevToolsStore } from "@/store";
import type { TimelineFilters } from "@/store/types";

import { countActiveFilters } from "./filters";
import { SearchInput, FilterToggle, ToolbarButton } from "./toolbar-controls";

interface ToolbarProps {
  filters: TimelineFilters;
  showFilters: boolean;
  onSearchChange: (value: string) => void;
  onToggleFilters: () => void;
  totalCount: number;
  filteredCount: number;
  pinnedCount: number;
}

export function Toolbar({
  filters,
  showFilters,
  onSearchChange,
  onToggleFilters,
  totalCount,
  filteredCount,
  pinnedCount,
}: ToolbarProps): React.ReactElement {
  const preserveLog = useDevToolsStore((s) => s.settings.preserveLog);
  const togglePreserveLog = useDevToolsStore((s) => s.togglePreserveLog);

  const activeFilterCount = countActiveFilters(filters);

  return (
    <div className="flex h-11 shrink-0 items-center gap-2 border-b border-border-subtle px-3">
      <SearchInput value={filters.search} onChange={onSearchChange} placeholder="Filter requests…" />

      <FilterToggle
        active={showFilters}
        count={activeFilterCount}
        onClick={onToggleFilters}
      />

      <ToolbarButton
        icon={Pin}
        tooltip={preserveLog ? "Preserve log ON" : "Preserve log OFF"}
        onClick={togglePreserveLog}
        active={preserveLog}
      />

      <div className="ml-auto flex items-center gap-2 text-body-sm text-muted-foreground">
        {pinnedCount > 0 && (
          <Badge variant="violet" className="text-[10px]">
            <Pin className="mr-1 size-2.5" />
            {pinnedCount}
          </Badge>
        )}
        <span className="tabular-nums">
          {filteredCount !== totalCount
            ? `${filteredCount} / ${totalCount}`
            : totalCount}
          {" requests"}
        </span>
      </div>
    </div>
  );
}
