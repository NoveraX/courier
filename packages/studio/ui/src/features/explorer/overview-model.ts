import type { Tone } from "@/design/tone";
import { isFailedState, requestStateOf } from "@/features/requests/request-state";
import type { RequestEntry } from "@/store/types";
import { ACTIVE_MS } from "./endpoint-metrics";
import type { EndpointNode, ExplorerModel, SourceNode } from "./explorer-model";

/** One of the six figures over the Overview. */
export interface OverviewFigure {
  key: "sources" | "groups" | "endpoints" | "active" | "healthy" | "errors";
  label: string;
  value: string;
  sub: string;
  tone: Tone;
}

/** What the Top endpoints card ranks by. */
export type TopMetric = "latency" | "errors" | "traffic";

export interface TopEntry {
  endpoint: EndpointNode;
  value: number;
  /** Its value against the top one's, 0–1. */
  share: number;
}

function share(part: number, whole: number): number {
  return whole ? Math.round((part / whole) * 100) : 100;
}

/**
 * The Overview's six figures: the sources and where they are defined, the
 * groups, the endpoints and how many were never called, how many are
 * active now, the share of called ones healthy, and the error rate.
 *
 * @param model - The Explorer's model
 * @param requests - The session's requests
 * @param configFile - The config file the sources come from
 * @returns The figures
 * @example
 * ```ts
 * overviewFigures(model, requests, "courier.config.ts")[0]; // { key: "sources", value: "13", … }
 * ```
 */
export function overviewFigures(
  model: ExplorerModel,
  requests: readonly RequestEntry[],
  configFile: string,
): OverviewFigure[] {
  const called = model.endpoints.filter((e) => e.metrics.calls > 0);
  const healthy = share(called.filter((e) => e.level === "healthy").length, called.length);
  const done = requests.filter((r) => requestStateOf(r) !== "pending");
  const failed = done.filter((r) => isFailedState(requestStateOf(r))).length;
  const rate = done.length ? (failed / done.length) * 100 : 0;
  const active = model.endpoints.filter((e) => e.metrics.active).length;
  return [
    {
      key: "sources",
      label: "Sources",
      value: String(model.sources.length),
      sub: `from ${configFile}`,
      tone: "normal",
    },
    {
      key: "groups",
      label: "Groups",
      value: String(model.groups.length),
      sub: "across all sources",
      tone: "normal",
    },
    {
      key: "endpoints",
      label: "Endpoints",
      value: String(model.endpoints.length),
      sub: `${model.endpoints.length - called.length} never called`,
      tone: "normal",
    },
    {
      key: "active",
      label: "Active now",
      value: String(active),
      sub: `called in last ${ACTIVE_MS / 1_000}s`,
      tone: active ? "brand" : "normal",
    },
    {
      key: "healthy",
      label: "Healthy",
      value: `${healthy}%`,
      sub: "of called endpoints",
      tone: healthy >= 90 ? "ok" : healthy >= 70 ? "warn" : "err",
    },
    {
      key: "errors",
      label: "Error rate",
      value: `${rate.toFixed(1)}%`,
      sub: `${failed} failed ${failed === 1 ? "call" : "calls"}`,
      tone: rate >= 5 ? "err" : "normal",
    },
  ];
}

/**
 * The endpoints that rank highest by p95 (HTTP only), by error rate or by
 * calls — seven at most, each with its share of the top value.
 *
 * @param model - The Explorer's model
 * @param by - What to rank by
 * @returns The ranking
 * @example
 * ```ts
 * topEndpoints(model, "latency")[0]?.endpoint.key; // the slowest
 * ```
 */
export function topEndpoints(model: ExplorerModel, by: TopMetric): TopEntry[] {
  const rankValue = (e: EndpointNode): number =>
    by === "errors"
      ? e.metrics.errorRate
      : by === "traffic"
        ? e.metrics.calls
        : (e.metrics.p95 ?? 0);
  const ranked = model.endpoints
    .filter((e) => e.metrics.calls > 0 && (by !== "latency" || e.transport === "http"))
    .sort((a, b) => rankValue(b) - rankValue(a))
    .slice(0, 7);
  const top = Math.max(0.0001, ...ranked.map(rankValue));
  return ranked.map((endpoint) => ({
    endpoint,
    value: rankValue(endpoint),
    share: rankValue(endpoint) / top,
  }));
}

/**
 * A source's success rate for its card: the share of its calls that did
 * not fail.
 *
 * @param source - The source
 * @returns 0–100, or `null` before any call
 * @example
 * ```ts
 * successRate(source); // 98
 * ```
 */
export function successRate(source: SourceNode): number | null {
  return source.metrics.calls ? Math.round(100 - source.metrics.errorRate) : null;
}
