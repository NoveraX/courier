import { useReactFlow } from "@xyflow/react";
import { Map as MapIcon, Maximize, ZoomIn, ZoomOut } from "lucide-react";
import { useCallback, useRef } from "react";
import { ToolbarButton } from "@/components/shared/toolbar-button";
import type { ExplorerLayout, ExplorerMetricMode } from "../../types";
import { LayoutToggle } from "./layout-toggle";
import { MetricModeSelect } from "./metric-mode-select";
import { SearchInput } from "./search-input";
import { useGraphShortcuts } from "./use-graph-shortcuts";

// ── Props ────────────────────────────────────────────────────────────────────

interface GraphToolbarProps {
  search: string;
  onSearchChange: (value: string) => void;
  layout: ExplorerLayout;
  onLayoutChange: (layout: ExplorerLayout) => void;
  metricMode: ExplorerMetricMode;
  onMetricModeChange: (mode: ExplorerMetricMode) => void;
  showMinimap: boolean;
  onToggleMinimap: () => void;
  endpointCount: number;
  matchCount: number | null;
}

// ── Component ────────────────────────────────────────────────────────────────

export function GraphToolbar({
  search,
  onSearchChange,
  layout,
  onLayoutChange,
  metricMode,
  onMetricModeChange,
  showMinimap,
  onToggleMinimap,
  endpointCount,
  matchCount,
}: GraphToolbarProps): React.ReactElement {
  const { zoomIn, zoomOut, fitView } = useReactFlow();
  const inputRef = useRef<HTMLInputElement>(null);

  useGraphShortcuts(inputRef, fitView);

  const handleFitView = useCallback(() => fitView({ padding: 0.15, duration: 300 }), [fitView]);

  return (
    <div className="absolute top-3 left-3 right-3 z-10 flex items-center gap-2">
      {/* Search */}
      <SearchInput
        ref={inputRef}
        value={search}
        onChange={onSearchChange}
        matchCount={matchCount}
        endpointCount={endpointCount}
      />

      <div className="flex-1" />

      {/* Layout + Metric mode */}
      <LayoutToggle value={layout} onChange={onLayoutChange} />
      <MetricModeSelect value={metricMode} onChange={onMetricModeChange} />

      <div className="h-5 w-px bg-border-subtle" />

      {/* Zoom controls */}
      <div className="flex items-center gap-0.5">
        <ToolbarButton
          icon={ZoomOut}
          tooltip="Zoom out"
          onClick={() => zoomOut({ duration: 200 })}
        />
        <ToolbarButton icon={ZoomIn} tooltip="Zoom in" onClick={() => zoomIn({ duration: 200 })} />
        <ToolbarButton icon={Maximize} tooltip="Fit to view" kbd="mod+0" onClick={handleFitView} />
      </div>

      {/* Minimap toggle */}
      <ToolbarButton
        icon={MapIcon}
        tooltip={showMinimap ? "Hide minimap" : "Show minimap"}
        onClick={onToggleMinimap}
        active={showMinimap}
      />
    </div>
  );
}
