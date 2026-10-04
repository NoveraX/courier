import type { RequestEntry } from "@/store/types";
import { filterRequests } from "../helpers";
import type { EndpointNodeData } from "../types";
import type { PhaseValue, TimingGroup, TimingRow, TimingSort } from "./timing-types";
import { TIMING_PHASES } from "./timing-types";

// ── Computation ────────────────────────────────────────────────────────────

export function computeTimingBreakdown(
  endpoints: EndpointNodeData[],
  requests: RequestEntry[],
  sort: TimingSort,
): TimingGroup[] {
  const rows: TimingRow[] = [];

  for (const ep of endpoints) {
    const reqs = filterRequests(requests, ep.source, ep.group, ep.method).filter(
      (r) => r.timing && r.timing.total > 0,
    );

    rows.push(reqs.length === 0 ? emptyRow(ep) : buildRow(ep, reqs));
  }

  rows.sort((a, b) => sortRows(a, b, sort));
  return groupRows(rows);
}

// ── Build row from requests with timing ────────────────────────────────────

function buildRow(ep: EndpointNodeData, reqs: RequestEntry[]): TimingRow {
  const n = reqs.length;
  let sumTotal = 0;
  let sumFetch = 0;
  let sumMiddleware = 0;
  let sumValidation = 0;

  for (const r of reqs) {
    const t = r.timing;
    if (!t) continue;
    sumTotal += t.total;
    sumFetch += t.fetch;
    sumMiddleware += t.middleware;
    sumValidation += t.validation;
  }

  const avgTotal = sumTotal / n;
  const avgFetch = sumFetch / n;
  const avgMiddleware = sumMiddleware / n;
  const avgValidation = sumValidation / n;
  const avgSetup = Math.max(0, avgTotal - avgFetch - avgMiddleware - avgValidation);

  const phases = buildPhases(avgSetup, avgValidation, avgMiddleware, avgFetch, avgTotal);
  const bottleneck = phases.length > 0 ? phases.reduce((a, b) => (b.avg > a.avg ? b : a)).key : "";

  return {
    source: ep.source,
    group: ep.group,
    method: ep.method,
    httpMethod: ep.httpMethod,
    endpointType: ep.endpointType,
    avgTotal,
    phases,
    sampleCount: n,
    bottleneck,
  };
}

function buildPhases(
  setup: number,
  validation: number,
  middleware: number,
  fetch: number,
  total: number,
): PhaseValue[] {
  const values: Record<string, number> = { setup, validation, middleware, fetch };

  /* Slivers are dropped by their share of the bar, not by an absolute
     duration: a millisecond threshold erased every phase of an endpoint that
     answers in microseconds, and a row with no phases left renders as though
     it had never been called. */
  return TIMING_PHASES.map((phase) => ({
    ...phase,
    avg: values[phase.key] ?? 0,
    pct: total > 0 ? ((values[phase.key] ?? 0) / total) * 100 : 0,
  })).filter((p) => p.pct >= 1);
}

function emptyRow(ep: EndpointNodeData): TimingRow {
  return {
    source: ep.source,
    group: ep.group,
    method: ep.method,
    httpMethod: ep.httpMethod,
    endpointType: ep.endpointType,
    avgTotal: 0,
    phases: [],
    sampleCount: 0,
    bottleneck: "",
  };
}

// ── Sorting ─────────────────────────────────────────────────────────────────

function sortRows(a: TimingRow, b: TimingRow, sort: TimingSort): number {
  // Empty rows always last
  if (a.sampleCount === 0 && b.sampleCount > 0) return 1;
  if (a.sampleCount > 0 && b.sampleCount === 0) return -1;

  if (sort === "total") return b.avgTotal - a.avgTotal;
  const phaseA = a.phases.find((p) => p.key === sort)?.avg ?? 0;
  const phaseB = b.phases.find((p) => p.key === sort)?.avg ?? 0;
  return phaseB - phaseA;
}

// ── Group by group name, sorted by hottest endpoint ─────────────────────────

function groupRows(rows: TimingRow[]): TimingGroup[] {
  const map = new Map<string, TimingRow[]>();

  for (const row of rows) {
    const existing = map.get(row.group);
    if (existing) existing.push(row);
    else map.set(row.group, [row]);
  }

  return [...map.entries()]
    .map(([name, groupRows]) => ({
      name,
      rows: groupRows,
      maxTotal: Math.max(0, ...groupRows.map((r) => r.avgTotal)),
    }))
    .sort((a, b) => b.maxTotal - a.maxTotal)
    .map(({ name, rows }) => ({ name, rows }));
}
