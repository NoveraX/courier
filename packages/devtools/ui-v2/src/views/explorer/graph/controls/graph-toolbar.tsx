import { useRef, useCallback } from "react";
import { useReactFlow } from "@xyflow/react";
import { ZoomIn, ZoomOut, Maximize, Map } from "lucide-react";

import type { ExplorerLayout, ExplorerMetricMode } from "../../types";
import { LayoutToggle } from "./layout-toggle";
import { MetricModeSelect } from "./metric-mode-select";
import { ToolbarButton } from "./toolbar-button";
import { SearchInput } from "./search-input";
import { useGraphShortcuts } from "./use-graph-shortcuts";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { KbdHint } from "@/components/shared/kbd-hint";

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

  const handleFitView = useCallback(
    () => fitView({ padding: 0.15, duration: 300 }),
    [fitView],
  );

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
        <ToolbarButton icon={ZoomOut} label="Zoom out" onClick={() => zoomOut({ duration: 200 })} />
        <ToolbarButton icon={ZoomIn} label="Zoom in" onClick={() => zoomIn({ duration: 200 })} />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={handleFitView}
              className="text-muted-foreground hover:text-foreground"
              aria-label="Fit view"
            >
              <Maximize className="size-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            Fit to view <KbdHint keys="mod+0" className="ml-1.5" />
          </TooltipContent>
        </Tooltip>
      </div>

      {/* Minimap toggle */}
      <ToolbarButton
        icon={Map}
        label={showMinimap ? "Hide minimap" : "Show minimap"}
        onClick={onToggleMinimap}
        active={showMinimap}
      />
    </div>
  );
}
