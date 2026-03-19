// ── Compare view types ──────────────────────────────────────────────────────

export type CompareTab = "payload" | "response" | "headers" | "timing";

export interface DiffLine {
  type: "equal" | "added" | "removed";
  left?: string;
  right?: string;
  lineNum: {
    left?: number;
    right?: number;
  };
}

export interface HeaderDiff {
  key: string;
  left?: string;
  right?: string;
  status: "equal" | "added" | "removed" | "changed";
}

export interface TimingComparison {
  phase: string;
  leftMs: number;
  rightMs: number;
  diffMs: number;
  diffPercent: number;
}
