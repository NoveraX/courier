import { Badge } from "@/components/ui/badge";
import { CountDisplay } from "@/components/shared/count-display";
import { SearchInput } from "@/components/shared/search-input";

import type { WaterfallSortField, WaterfallGroupBy } from "@/store/types";
import type { ModeFilter } from "./types";
import { SortSelect, GroupSelect, ModeToggle, ZoomControls } from "./toolbar-controls";

interface ToolbarProps {
  search: string;
  sortBy: WaterfallSortField;
  groupBy: WaterfallGroupBy;
  modeFilter: ModeFilter;
  zoom: number;
  totalCount: number;
  filteredCount: number;
  onSearchChange: (v: string) => void;
  onSortChange: (v: WaterfallSortField) => void;
  onGroupChange: (v: WaterfallGroupBy) => void;
  onModeChange: (v: ModeFilter) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetZoom: () => void;
  onZoomToFit: () => void;
}

export function Toolbar({
  search, sortBy, groupBy, modeFilter, zoom,
  totalCount, filteredCount,
  onSearchChange, onSortChange, onGroupChange, onModeChange,
  onZoomIn, onZoomOut, onResetZoom, onZoomToFit,
}: ToolbarProps): React.ReactElement {
  return (
    <div className="flex h-11 shrink-0 items-center gap-2 border-b border-border-subtle px-3">
      <SearchInput value={search} onChange={onSearchChange} placeholder="Filter endpoints…" />

      <SortSelect value={sortBy} onChange={onSortChange} />
      <GroupSelect value={groupBy} onChange={onGroupChange} />

      <div className="h-4 w-px bg-border-subtle" />

      <ModeToggle value={modeFilter} onChange={onModeChange} />

      <div className="h-4 w-px bg-border-subtle" />

      <ZoomControls zoom={zoom} onIn={onZoomIn} onOut={onZoomOut} onReset={onResetZoom} onFit={onZoomToFit} />

      <div className="ml-auto flex items-center gap-2 text-body-sm text-muted-foreground">
        <CountDisplay filtered={filteredCount} total={totalCount} label="requests" />
        <Badge variant="secondary" className="text-[10px] tabular-nums">
          {zoom.toFixed(1)}×
        </Badge>
      </div>
    </div>
  );
}
