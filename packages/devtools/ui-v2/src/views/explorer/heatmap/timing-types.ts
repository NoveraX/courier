// ── Phase config ───────────────────────────────────────────────────────────

export interface TimingPhase {
  key: string;
  label: string;
  color: string;
}

export const TIMING_PHASES: TimingPhase[] = [
  { key: "setup", label: "Setup", color: "bg-slate-400" },
  { key: "validation", label: "Validation", color: "bg-amber-500" },
  { key: "middleware", label: "Middleware", color: "bg-violet-500" },
  { key: "fetch", label: "Fetch", color: "bg-sky-500" },
];

// ── Row data ───────────────────────────────────────────────────────────────

export interface TimingRow {
  source: string;
  group: string;
  method: string;
  httpMethod: string;
  endpointType: "query" | "mutation" | "untyped";
  avgTotal: number;
  phases: PhaseValue[];
  sampleCount: number;
  /** Dominant phase key (largest avg) */
  bottleneck: string;
}

export interface PhaseValue {
  key: string;
  label: string;
  color: string;
  avg: number;
  pct: number;
}

export interface TimingGroup {
  name: string;
  rows: TimingRow[];
}

// ── Sort options ───────────────────────────────────────────────────────────

export type TimingSort = "total" | "fetch" | "middleware" | "validation" | "setup";
