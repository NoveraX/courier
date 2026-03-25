import { useMemo, useState } from "react";
import { Flame } from "lucide-react";

import { EmptyState } from "@/components/shared/empty-state";
import { PageShell } from "@/components/shared/page-shell";
import { useDevToolsStore } from "@/store";
import { useExplorerData } from "../use-explorer-data";
import { useExplorerNavigation } from "../use-explorer-navigation";
import { EndpointPanel } from "../detail/endpoint-panel";
import { computeTimingBreakdown } from "./compute-heatmap";
import { HeatmapToolbar } from "./heatmap-toolbar";
import { HeatmapGrid } from "./heatmap-grid";
import { HeatmapLegend } from "./heatmap-legend";
import { applyHeatmapFilters, EMPTY_HEATMAP_FILTERS } from "./heatmap-filters";

import type { HeatmapFilters } from "./heatmap-filters";
import type { TimingSort } from "./timing-types";

// ── Component ──────────────────────────────────────────────────────────────

export function HeatmapPage(): React.ReactElement {
  const { endpoints, isEmpty } = useExplorerData();
  const requests = useDevToolsStore((s) => s.requests);
  const { navigateToTimeline, openPlayground } = useExplorerNavigation();
  const [filters, setFilters] = useState<HeatmapFilters>(EMPTY_HEATMAP_FILTERS);
  const [sort, setSort] = useState<TimingSort>("total");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const filtered = useMemo(
    () => applyHeatmapFilters(endpoints, filters),
    [endpoints, filters],
  );

  const groups = useMemo(
    () => computeTimingBreakdown(filtered, requests, sort),
    [filtered, requests, sort],
  );

  const maxTotal = useMemo(
    () => groups.reduce((m, g) => Math.max(m, ...g.rows.map((r) => r.avgTotal)), 0),
    [groups],
  );

  function setFilter<K extends keyof HeatmapFilters>(key: K, value: HeatmapFilters[K]): void {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }

  if (isEmpty) {
    return (
      <PageShell center>
        <EmptyState
          icon={Flame}
          heading="No performance data"
          description="Define API sources and make requests to see timing breakdowns."
        />
      </PageShell>
    );
  }

  const hasTimingData = groups.some((g) => g.rows.some((r) => r.sampleCount > 0));

  const toolbar = (
    <HeatmapToolbar
      endpoints={endpoints}
      filters={filters}
      onFilterChange={setFilter}
      onReset={() => setFilters(EMPTY_HEATMAP_FILTERS)}
      sort={sort}
      onSortChange={setSort}
      total={endpoints.length}
      filtered={filtered.length}
    />
  );

  if (!hasTimingData) {
    return (
      <>
        <PageShell toolbar={toolbar} footer={<HeatmapLegend />} center>
          <EmptyState
            icon={Flame}
            heading="No timing data"
            description="Make API requests to see where time is spent per endpoint."
          />
        </PageShell>
        <EndpointPanel selectedKey={selectedKey} onClose={() => setSelectedKey(null)} onNavigateToTimeline={navigateToTimeline} onOpenPlayground={openPlayground} />
      </>
    );
  }

  return (
    <>
      <PageShell toolbar={toolbar} footer={<HeatmapLegend />}>
        <HeatmapGrid
          groups={groups}
          maxTotal={maxTotal}
          selectedKey={selectedKey}
          onSelect={setSelectedKey}
        />
      </PageShell>
      <EndpointPanel selectedKey={selectedKey} onClose={() => setSelectedKey(null)} onNavigateToTimeline={navigateToTimeline} onOpenPlayground={openPlayground} />
    </>
  );
}
