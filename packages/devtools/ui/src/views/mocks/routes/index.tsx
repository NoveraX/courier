import { useState } from "react";
import { Globe } from "lucide-react";
import { PageShell } from "@/components/shared/page-shell";
import { EmptyState } from "@/components/shared/empty-state";
import { useActiveServer } from "@/store/mock-slice";

import type { MockRouteEntry } from "@/store/mock-slice";

import { RoutesToolbar } from "./routes-toolbar";
import { RoutesTable } from "./routes-table";
import { RouteDetail } from "./route-detail";
import { useRoutesFilter } from "./use-routes-filter";

export function MockRoutesView(): React.ReactElement {
  const server = useActiveServer();
  const routes = server?.routes ?? [];
  const filter = useRoutesFilter(routes);
  const [selected, setSelected] = useState<MockRouteEntry | null>(null);

  if (!server) {
    return (
      <PageShell center>
        <EmptyState icon={Globe} heading="No server selected" description="Select a mock server to browse its routes." />
      </PageShell>
    );
  }

  if (routes.length === 0) {
    return (
      <PageShell toolbar={<RoutesToolbar filter={filter} />} center>
        <EmptyState icon={Globe} heading="No routes" description="This server has no registered routes yet." />
      </PageShell>
    );
  }

  const serverUrl = server.url || `http://localhost:${server.port}`;

  return (
    <PageShell toolbar={<RoutesToolbar filter={filter} />} noScroll>
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div className="flex-1 overflow-y-auto">
          <RoutesTable
            routes={filter.filtered}
            sortKey={filter.state.sortKey}
            sortDir={filter.state.sortDir}
            onSort={filter.handleSort}
            onSelect={setSelected}
            selectedRoute={selected}
          />
        </div>
        {selected && (
          <RouteDetail route={selected} serverUrl={serverUrl} onClose={() => setSelected(null)} />
        )}
      </div>
    </PageShell>
  );
}
