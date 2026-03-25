import { useCallback, useState } from "react";
import { Activity } from "lucide-react";

import { EmptyState } from "@/components/shared/empty-state";
import { useEscapeClose } from "@/hooks/use-escape-close";
import { useActiveServer, useMockStore } from "@/store/mock-slice";

import type { MockRequestLog } from "@/store/mock-slice";

import { LogsToolbar } from "./logs-toolbar";
import { LogsFilterBar } from "./logs-filter-bar";
import { LogList } from "./log-list";
import { LogDetail } from "./log-detail";
import { useLogFilter } from "./use-log-filter";

export function MockLogsView(): React.ReactElement {
  const server = useActiveServer();
  const allLogs = useMockStore((s) => s.logs);
  const serverLogs = server
    ? allLogs.filter((l) => l.serverId === server.serverId)
    : [];

  const { state, filtered, showFilters, setSearch, setFilter, resetFilters, toggleFilters } = useLogFilter(serverLogs);
  const [selected, setSelected] = useState<MockRequestLog | null>(null);
  const closeDetail = useCallback(() => setSelected(null), []);

  useEscapeClose(selected !== null, closeDetail);

  const handleSearchChange = useCallback(
    (value: string) => setSearch(value),
    [setSearch],
  );

  const handleSelect = useCallback(
    (log: MockRequestLog) => setSelected(log),
    [],
  );

  if (!server) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <EmptyState icon={Activity} heading="No server selected" description="Select a mock server to view its request logs." />
      </div>
    );
  }

  if (serverLogs.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <LogsToolbar
          filters={state}
          showFilters={showFilters}
          filteredLogs={[]}
          serverName={server.name}
          onSearchChange={handleSearchChange}
          onToggleFilters={toggleFilters}
          totalCount={0}
          filteredCount={0}
        />
        <div className="flex flex-1 items-center justify-center p-8">
          <EmptyState icon={Activity} heading="No requests yet" description="Send a request to your mock server to see logs here." />
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <LogsToolbar
        filters={state}
        showFilters={showFilters}
        filteredLogs={filtered}
        serverName={server.name}
        onSearchChange={handleSearchChange}
        onToggleFilters={toggleFilters}
        totalCount={serverLogs.length}
        filteredCount={filtered.length}
      />

      {showFilters && (
        <LogsFilterBar
          logs={serverLogs}
          filters={state}
          onFilterChange={setFilter}
          onReset={resetFilters}
        />
      )}

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <LogList
          logs={filtered}
          selectedId={selected?.id ?? null}
          onSelect={handleSelect}
        />
        {selected && (
          <LogDetail
            log={selected}
            serverUrl={server.url || `http://localhost:${server.port}`}
            onClose={closeDetail}
          />
        )}
      </div>
    </div>
  );
}
