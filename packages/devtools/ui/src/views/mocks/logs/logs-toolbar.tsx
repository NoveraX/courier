import { Download, Pause, Pin, Play, Trash2 } from "lucide-react";

import { exportAsJson } from "@/lib/export";
import { CountDisplay } from "@/components/shared/count-display";
import { FilterToggle } from "@/components/shared/filter-toggle";
import { SearchInput } from "@/components/shared/search-input";
import { ToolbarButton } from "@/components/shared/toolbar-button";
import { useMockStore } from "@/store/mock-slice";

import type { MockRequestLog } from "@/store/mock-slice";
import type { LogFilterState } from "./use-log-filter";

interface LogsToolbarProps {
  filters: LogFilterState;
  showFilters: boolean;
  filteredLogs: MockRequestLog[];
  serverName: string;
  onSearchChange: (value: string) => void;
  onToggleFilters: () => void;
  totalCount: number;
  filteredCount: number;
}

export function LogsToolbar({
  filters,
  showFilters,
  filteredLogs,
  serverName,
  onSearchChange,
  onToggleFilters,
  totalCount,
  filteredCount,
}: LogsToolbarProps): React.ReactElement {
  const paused = useMockStore((s) => s.logsPaused);
  const togglePaused = useMockStore((s) => s.toggleLogsPaused);
  const clearLogs = useMockStore((s) => s.clearLogs);

  const activeFilterCount = countActive(filters);

  return (
    <div className="flex h-11 shrink-0 items-center gap-2 border-b border-border-subtle px-3">
      <SearchInput value={filters.search} onChange={onSearchChange} placeholder="Filter requests…" />

      <FilterToggle
        active={showFilters}
        count={activeFilterCount}
        onClick={onToggleFilters}
      />

      <ToolbarButton
        icon={paused ? Play : Pause}
        tooltip={paused ? "Resume log stream" : "Pause log stream"}
        onClick={togglePaused}
        active={paused}
      />

      <ToolbarButton icon={Trash2} tooltip="Clear logs" onClick={clearLogs} />

      <ToolbarButton
        icon={Download}
        tooltip="Export as JSON"
        onClick={() => exportAsJson(filteredLogs, `${serverName}-logs-${Date.now()}.json`)}
      />

      <div className="ml-auto flex items-center gap-2 text-body-sm text-muted-foreground">
        {paused && (
          <Pin className="size-3 text-amber-400" />
        )}
        <CountDisplay filtered={filteredCount} total={totalCount} label="requests" />
      </div>
    </div>
  );
}

function countActive(filters: LogFilterState): number {
  let count = 0;
  if (filters.method.length > 0) count++;
  if (filters.statusRange.length > 0) count++;
  if (filters.group.length > 0) count++;
  return count;
}
