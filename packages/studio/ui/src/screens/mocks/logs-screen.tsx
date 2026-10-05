import { useNavigate, useSearch } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import { Download, Pause, Play, Trash2 } from "lucide-react";

import { SearchField } from "@/design/search-field";
import type { SegmentedOption } from "@/design/segmented";
import { Segmented } from "@/design/segmented";
import type { LogFilter, MockLogsSearch } from "@/features/mocks/logs-view";
import { filterCounts, LOG_FILTERS, logMatches, showsIn } from "@/features/mocks/logs-view";
import { logsOf } from "@/features/mocks/mock-log";
import { exportAsJson } from "@/lib/export";
import { clearMockLogs } from "@/mocks/clear-mock-logs";
import { useStudioStore } from "@/store";
import { useMockStore } from "@/store/mock-slice";
import { MockLogRow } from "./mock-log-row";
import { useMockServer } from "./use-mock-server";

const LABELS: Readonly<Record<LogFilter, string>> = {
  all: "All",
  errors: "Errors",
  chaos: "Chaos",
  scenario: "Scenario",
};

function ToolButton({
  icon: Icon,
  label,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
}): React.ReactNode {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-7 cursor-pointer items-center gap-1.5 rounded-control border border-line px-2.5 text-small text-fg-muted hover:border-line-strong hover:text-fg"
    >
      <Icon aria-hidden="true" className="size-3" />
      {label}
    </button>
  );
}

/**
 * The mock's log: every request it answered, newest first — all of them,
 * the failed ones, the ones chaos failed, or the ones a scenario or an
 * override answered — searchable, paused, exported or cleared, each
 * opening on what it was answered with.
 *
 * @returns The Logs tab
 * @example
 * ```tsx
 * <MockLogsScreen />
 * ```
 */
export function MockLogsScreen(): React.ReactNode {
  const { server } = useMockServer();
  const search: MockLogsSearch = useSearch({ from: "/mocks/logs" });
  const navigate = useNavigate({ from: "/mocks/logs" });
  const allLogs = useMockStore((s) => s.logs);
  const paused = useMockStore((s) => s.logsPaused);
  const togglePaused = useMockStore((s) => s.toggleLogsPaused);
  const slowMs = useStudioStore((s) => s.settings.slowRequestThreshold);
  if (!server) return null;
  const logs = logsOf(allLogs, server.serverId);
  const counts = filterCounts(logs);
  const show = search.show ?? "all";
  const shown = logs.filter((log) => showsIn(log, show) && logMatches(log, search.q ?? ""));
  const update = (patch: MockLogsSearch): Promise<void> =>
    navigate({
      search: (prev) => ({
        req: prev.req,
        tab: prev.tab,
        show: prev.show,
        q: prev.q,
        log: prev.log,
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
    <div className="flex min-h-full flex-col">
      <div className="sticky top-0 z-2 flex flex-wrap items-center gap-2.5 border-b border-line bg-bg px-5 py-2.5">
        <Segmented
          label="Show"
          quiet="subtle"
          options={options}
          value={show}
          onChange={(next) => update({ show: next === "all" ? undefined : next, log: undefined })}
        />
        <SearchField
          label="Search the log"
          placeholder="Path or endpoint"
          value={search.q ?? ""}
          onChange={(q) => update({ q: q || undefined })}
          className="w-60"
        />
        <div className="flex-1" />
        <ToolButton
          icon={paused ? Play : Pause}
          label={paused ? "Resume" : "Pause"}
          onClick={togglePaused}
        />
        <ToolButton
          icon={Download}
          label="Export"
          onClick={() => exportAsJson(shown, `${server.name}-log.json`)}
        />
        <ToolButton icon={Trash2} label="Clear" onClick={() => clearMockLogs(server.serverId)} />
      </div>
      {paused && (
        <p className="border-b border-line bg-warn-dim px-5 py-1.5 text-small text-warn">
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
      <section aria-label="Requests" className="flex flex-col">
        {shown.map((log) => (
          <MockLogRow
            key={log.id}
            log={log}
            open={search.log === log.id}
            slowMs={slowMs}
            onToggle={() => update({ log: search.log === log.id ? undefined : log.id })}
          />
        ))}
      </section>
    </div>
  );
}
