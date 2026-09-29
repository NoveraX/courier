import { List } from "lucide-react";
import { useState } from "react";

import { EmptyState } from "@/components/shared/empty-state";
import { PageShell } from "@/components/shared/page-shell";
import { EndpointPanel } from "../detail/endpoint-panel";
import { useExplorerNavigation } from "../use-explorer-navigation";
import { EndpointsTable } from "./endpoints-table";
import { EndpointsToolbar } from "./endpoints-toolbar";
import { useEndpointsTable } from "./use-endpoints-table";

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
          description="Define API sources in your project to see the endpoint catalog with types, paths, and performance metrics."
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
