import type { MockRequestLog } from "@/store/mock-slice";
import { injectedFault, mockLogCode, mockLogTone } from "./mock-log";

/** Which answers the Logs tab shows. */
export const LOG_FILTERS = ["all", "errors", "chaos", "scenario"] as const;
export type LogFilter = (typeof LOG_FILTERS)[number];

/** The Logs tab's part of the address, each left out while it is the default. */
export interface MockLogsSearch {
  show?: Exclude<LogFilter, "all"> | undefined;
  q?: string | undefined;
}

/**
 * Read the Logs tab's parameters from its address.
 *
 * @param raw - The address's parameters
 * @returns Which answers and the search, when they differ from the defaults
 * @example
 * ```ts
 * validateMockLogsSearch({ show: "chaos", q: "users" }); // { show: "chaos", q: "users" }
 * ```
 */
export function validateMockLogsSearch(raw: Record<string, unknown>): MockLogsSearch {
  const search: MockLogsSearch = {};
  const show = LOG_FILTERS.find((f) => f !== "all" && f === raw.show);
  if (show && show !== "all") search.show = show;
  if (typeof raw.q === "string" && raw.q) search.q = raw.q;
  return search;
}

/** What answered a request, as its row's tag says it. */
export interface LogTag {
  tag: string;
  tone: "err" | "warn" | "keyword" | "subtle";
}

/**
 * What answered a request: a fault chaos injected, the scenario on, an
 * override in the mocks file, or the generated handler.
 *
 * @param log - The logged request
 * @returns Its tag and tone
 * @example
 * ```ts
 * logTag({ ...log, error: "HTTP 503 (simulated)" }); // { tag: "chaos · 503", tone: "err" }
 * ```
 */
export function logTag(log: Pick<MockRequestLog, "error" | "source">): LogTag {
  const fault = injectedFault(log);
  if (fault) return { tag: `chaos · ${fault}`, tone: "err" };
  if (log.source === "scenario") return { tag: "scenario", tone: "warn" };
  if (log.source === "override") return { tag: "override", tone: "keyword" };
  return { tag: "handler", tone: "subtle" };
}

/**
 * Whether an answer is one a filter shows: any, a failed one, one chaos
 * failed, or one a scenario or an override gave.
 *
 * @param log - The logged request
 * @param filter - The filter
 * @returns Whether it shows
 * @example
 * ```ts
 * showsIn({ ...log, status: 404 }, "errors"); // true
 * ```
 */
export function showsIn(
  log: Pick<MockRequestLog, "status" | "error" | "source">,
  filter: LogFilter,
): boolean {
  if (filter === "errors") return mockLogTone(log) !== "ok";
  if (filter === "chaos") return injectedFault(log) !== undefined;
  if (filter === "scenario")
    return (
      injectedFault(log) === undefined && (log.source === "scenario" || log.source === "override")
    );
  return true;
}

/**
 * How many answers each filter shows.
 *
 * @param logs - The server's logged requests
 * @returns The count per filter
 * @example
 * ```ts
 * filterCounts(logs).errors; // 3
 * ```
 */
export function filterCounts(logs: readonly MockRequestLog[]): Record<LogFilter, number> {
  return {
    all: logs.length,
    errors: logs.filter((log) => showsIn(log, "errors")).length,
    chaos: logs.filter((log) => showsIn(log, "chaos")).length,
    scenario: logs.filter((log) => showsIn(log, "scenario")).length,
  };
}

/**
 * Whether a request's path or its `group.endpoint` holds the search, in
 * any case.
 *
 * @param log - The logged request
 * @param q - The search
 * @returns Whether it matches
 * @example
 * ```ts
 * logMatches(log, "users.LIST"); // true
 * ```
 */
export function logMatches(
  log: Pick<MockRequestLog, "path" | "group" | "endpoint">,
  q: string,
): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  const name = log.group ? `${log.group}.${log.endpoint}` : log.endpoint;
  return log.path.toLowerCase().includes(needle) || name.toLowerCase().includes(needle);
}

/**
 * The code a row shows: the status, `RST` for a connection chaos dropped,
 * `ERR` for a failure without one, `···` while the request runs.
 *
 * @param log - The logged request
 * @returns The code
 * @example
 * ```ts
 * logCode({ status: 502, error: "Connection Reset (simulated)" }); // "RST"
 * ```
 */
export function logCode(log: Pick<MockRequestLog, "status" | "error">): string {
  return injectedFault(log) === "reset" ? "RST" : mockLogCode(log);
}
