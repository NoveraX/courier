import type { Tone } from "@/design/tone";
import { percentile } from "@/features/requests/percentile";
import { formatDuration } from "@/lib/formatters";
import type { MockRequestLog, MockRouteEntry, MockServerInfo } from "@/store/mock-slice";
import { mockLogTone } from "./mock-log";
import { HAPPY_PATH } from "./scenario-view";

/* The figures that sample the latest answers read this many. */
const RECENT = 60;
const MINUTE = 60_000;

/** One of the dashboard's six figures, before its icon is picked. */
export interface MockFigure {
  key: "routes" | "throughput" | "errors" | "latency" | "scenario" | "chaos";
  label: string;
  value: string;
  sub: string;
  tone: Tone;
  text?: boolean;
}

const CHAOS_LABELS: Readonly<Record<MockServerInfo["chaosPreset"], string>> = {
  none: "Stable",
  degraded: "Degraded",
  unstable: "Unstable",
  down: "Down",
  custom: "Custom",
};

/* The mock keeps the share of calls it fails as 0–1. */
function faultPercent(server: MockServerInfo): number {
  return Math.round((server.networkConfig?.errorRate ?? 0) * 100);
}

function delayOf(server: MockServerInfo): string {
  const latency = server.networkConfig?.latency;
  if (latency === undefined || latency === 0) return "no delay";
  return typeof latency === "number"
    ? `${latency}ms delay`
    : `${latency.min}–${latency.max}ms delay`;
}

function scenarioFigure(server: MockServerInfo): MockFigure {
  const active = server.scenarios.find((s) => s.isActive);
  const name = active?.name ?? server.activeScenario;
  if (!name || name === HAPPY_PATH) {
    return {
      key: "scenario",
      label: "Scenario",
      value: "Happy path",
      sub: "0 overrides",
      tone: "normal",
      text: true,
    };
  }
  const count = active?.endpointCount ?? 0;
  return {
    key: "scenario",
    label: "Scenario",
    value: name,
    sub: `${count} ${count === 1 ? "override" : "overrides"}`,
    tone: "warn",
    text: true,
  };
}

/**
 * The Mocks dashboard's six figures for a server: its routes and how many
 * are not generated, the answers a minute, the error rate and the p95 and
 * median of the latest answers, the scenario on, and the chaos and delay
 * in force.
 *
 * @param server - The mock server
 * @param logs - Its logged requests, newest first
 * @param now - The time now
 * @param slowMs - Studio's slow-request threshold
 * @returns The figures
 * @example
 * ```ts
 * mockFigures(server, logs, Date.now(), 500)[1]?.value; // "136/min"
 * ```
 */
export function mockFigures(
  server: MockServerInfo,
  logs: readonly MockRequestLog[],
  now: number,
  slowMs: number,
): MockFigure[] {
  const recent = logs.slice(0, RECENT);
  const failed = recent.filter((log) => mockLogTone(log) !== "ok").length;
  const rate = recent.length ? (failed / recent.length) * 100 : 0;
  const durations = recent.flatMap((log) => (log.duration === undefined ? [] : [log.duration]));
  const p95 = percentile(durations, 0.95);
  const p50 = percentile(durations, 0.5);
  const chaos = server.chaosPreset;
  return [
    {
      key: "routes",
      label: "Routes",
      value: String(server.routes.length),
      sub: `${server.routes.filter((r) => r.source !== "auto").length} overridden or custom`,
      tone: "normal",
    },
    {
      key: "throughput",
      label: "Throughput",
      value: `${logs.filter((log) => now - log.timestamp < MINUTE).length}/min`,
      sub: `${server.requestsServed} responses served`,
      tone: "normal",
    },
    {
      key: "errors",
      label: "Error rate",
      value: `${rate.toFixed(1)}%`,
      sub: `last ${RECENT} responses`,
      tone: failed ? "err" : "ok",
    },
    {
      key: "latency",
      label: "P95 latency",
      value: p95 === null ? "—" : formatDuration(p95),
      sub: p50 === null ? "no answers yet" : `p50 ${formatDuration(p50)}`,
      tone: p95 === null ? "muted" : p95 > slowMs * 2 ? "err" : p95 > slowMs ? "warn" : "normal",
    },
    scenarioFigure(server),
    {
      key: "chaos",
      label: "Chaos",
      value: CHAOS_LABELS[chaos],
      sub: `${faultPercent(server)}% faults · ${delayOf(server)}`,
      tone: chaos === "none" ? "normal" : "err",
      text: true,
    },
  ];
}

/**
 * A server's busiest routes, each with its hits against the busiest.
 *
 * @param routes - Its routes
 * @param count - How many to keep
 * @returns The routes, busiest first
 * @example
 * ```ts
 * topRoutes(server.routes)[0]?.route.fullPath; // "/api/orders"
 * ```
 */
export function topRoutes(
  routes: readonly MockRouteEntry[],
  count = 6,
): { route: MockRouteEntry; share: number }[] {
  const top = [...routes].sort((a, b) => b.hits - a.hits).slice(0, count);
  const most = Math.max(1, ...top.map((r) => r.hits));
  return top.map((route) => ({ route, share: route.hits / most }));
}
