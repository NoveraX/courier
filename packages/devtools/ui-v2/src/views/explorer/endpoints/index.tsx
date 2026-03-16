import { useState } from "react";
import { List } from "lucide-react";

import { EmptyState } from "@/components/shared/empty-state";
import { PageShell } from "@/components/shared/page-shell";
import { EndpointPanel } from "../detail/endpoint-panel";
import { useExplorerNavigation } from "../use-explorer-navigation";
import { useEndpointsTable } from "./use-endpoints-table";
import { EndpointsToolbar } from "./endpoints-toolbar";
import { EndpointsTable } from "./endpoints-table";

// ── Component ──────────────────────────────────────────────────────────────

export function EndpointsCatalog(): React.ReactElement {
  const {
    allEndpoints,
    rows,
    total,
    isEmpty,
    filters,
    setFilter,
    resetFilters,
    sorting,
    setSorting,
  } = useEndpointsTable();

  const { navigateToTimeline, openPlayground } = useExplorerNavigation();
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  if (isEmpty) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <EmptyState
          icon={List}
          heading="No endpoints discovered"
          description="Connect your app to see the full endpoint catalog with types, paths, and live performance metrics."
        />
      </div>
    );
  }

  const toolbar = (
    <EndpointsToolbar
      endpoints={allEndpoints}
      filters={filters}
      total={total}
      filtered={rows.length}
      onFilterChange={setFilter}
      onReset={resetFilters}
    />
  );

  return (
    <>
      <PageShell toolbar={toolbar} noScroll>
        {rows.length === 0 ? (
          <div className="flex flex-1 items-center justify-center">
            <EmptyState
              icon={List}
              heading="No endpoints match"
              description="Try adjusting your search or filters."
              action={{ label: "Clear filters", onClick: resetFilters }}
            />
          </div>
        ) : (
          <EndpointsTable
            data={rows}
            sorting={sorting}
            onSortingChange={setSorting}
            selectedKey={selectedKey}
            onSelect={setSelectedKey}
          />
        )}
      </PageShell>

      <EndpointPanel
        selectedKey={selectedKey}
        onClose={() => setSelectedKey(null)}
        onNavigateToTimeline={navigateToTimeline}
        onOpenPlayground={openPlayground}
      />
    </>
  );
}
