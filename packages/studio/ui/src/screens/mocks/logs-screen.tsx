import { useNavigate, useSearch } from "@tanstack/react-router";

import type { SegmentedOption } from "@/design/segmented";
import type { LogFilter, MockLogsSearch } from "@/features/mocks/logs-view";
import { filterCounts, LOG_FILTERS, logMatches, showsIn } from "@/features/mocks/logs-view";
import { logsOf } from "@/features/mocks/mock-log";
import { inspectorOf } from "@/features/requests/inspector-of";
import { useFirstLoad } from "@/hooks/use-first-load";
import { useMockInspector } from "@/inspector/use-mock-inspector";
import { exportAsJson } from "@/lib/export";
import { clearMockLogs } from "@/mocks/clear-mock-logs";
import { useStudioStore } from "@/store";
import { useMockStore } from "@/store/mock-slice";
import { LogsToolbar } from "./logs-toolbar";
import { MockLogList } from "./mock-log-list";
import { MocksSkeleton } from "./mocks-skeleton";
import { NoMockServers } from "./no-mock-servers";
import { useMockServer } from "./use-mock-server";

const LABELS: Readonly<Record<LogFilter, string>> = {
  all: "All",
  errors: "Errors",
  chaos: "Chaos",
  scenario: "Scenario",
};

/**
 * The mock's log: every request it answered, newest first — all of them,
 * the failed ones, the ones chaos failed, or the ones a scenario or an
 * override answered — searchable, paused, exported or cleared, each
 * opening its sheet: the answer, what it was asked with, the headers and a
 * cURL.
 *
 * @returns The Logs tab
 * @example
 * ```tsx
 * <MockLogsScreen />
 * ```
 */
export function MockLogsScreen(): React.ReactNode {
  const { server } = useMockServer();
  const first = useFirstLoad();
  const loading = first.requests || first.sources;
  const search: MockLogsSearch = useSearch({ from: "/mocks/logs" });
  const navigate = useNavigate({ from: "/mocks/logs" });
  const sheet = useMockInspector();
  const allLogs = useMockStore((s) => s.logs);
  const paused = useMockStore((s) => s.logsPaused);
  const togglePaused = useMockStore((s) => s.toggleLogsPaused);
  const slowMs = useStudioStore((s) => s.settings.slowRequestThreshold);
  if (!server) return loading ? <MocksSkeleton view="list" /> : <NoMockServers />;
  const logs = logsOf(allLogs, server.serverId);
  const counts = filterCounts(logs);
  const show = search.show ?? "all";
  const shown = logs.filter((log) => showsIn(log, show) && logMatches(log, search.q ?? ""));
  const update = (patch: MockLogsSearch): Promise<void> =>
    navigate({
      search: (prev) => ({
        ...inspectorOf(prev),
        show: prev.show,
        q: prev.q,
        ...patch,
      }),
      replace: true,
    });
  const options: SegmentedOption<LogFilter>[] = LOG_FILTERS.map((filter) => ({
    value: filter,
    label: LABELS[filter],
    count: counts[filter],
    countTone: filter === "errors" ? "err" : "subtle",
  }));
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <LogsToolbar
        filters={options}
        show={show}
        onShow={(next) => void update({ show: next === "all" ? undefined : next })}
        q={search.q ?? ""}
        onSearch={(q) => void update({ q: q || undefined })}
        paused={paused}
        onPause={togglePaused}
        onExport={() => exportAsJson(shown, `${server.name}-log.json`)}
        onClear={() => clearMockLogs(server.serverId)}
      />
      {paused && (
        <p className="border-b border-line bg-warn-dim px-5 py-1.5 text-small text-warn max-sm:px-4">
          Paused — new requests are not added until you resume
        </p>
      )}
      {shown.length === 0 && (
        <p className="m-auto p-10 text-center text-control text-fg-subtle">
          {logs.length === 0
            ? "No requests yet — call an endpoint the mock serves"
            : "No requests match"}
        </p>
      )}
      {shown.length > 0 && (
        <MockLogList logs={shown} selected={sheet.requestId} slowMs={slowMs} onOpen={sheet.open} />
      )}
    </div>
  );
}
