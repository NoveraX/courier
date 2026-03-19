import type { RequestEntry } from "@/store";

// ── Segment model ──────────────────────────────────────────────────────────

export type SegmentKey =
  | "middleware-req"
  | "fetch"
  | "validation"
  | "middleware-res"
  | "client-to-proxy"
  | "proxy-to-client";

export interface WaterfallSegment {
  key: SegmentKey;
  /** Offset from row start in ms */
  start: number;
  /** Duration in ms */
  duration: number;
}

// ── Row model ──────────────────────────────────────────────────────────────

export interface WaterfallRow {
  request: RequestEntry;
  /** Offset from the earliest request in ms */
  offsetMs: number;
  segments: WaterfallSegment[];
  totalDuration: number;
  isProxy: boolean;
}

// ── Timeline gap (compressed dead time) ───────────────────────────────────

export interface TimeGap {
  /** Position in compressed timeline (ms) */
  compressedOffsetMs: number;
  /** Actual wall-clock duration that was collapsed */
  actualDurationMs: number;
  /** Visual width in compressed timeline (ms) */
  widthMs: number;
}

// ── Zoom / layout state ────────────────────────────────────────────────────

export interface ZoomState {
  scale: number;
  panX: number;
}

export type ModeFilter = "all" | "direct" | "proxy";

// ── Grouped rows ───────────────────────────────────────────────────────────

export interface GroupedRows {
  key: string;
  label: string;
  rows: WaterfallRow[];
}

// ── Flat item for virtualization ──────────────────────────────────────────

export interface FlatItem {
  type: "row" | "group-header";
  row?: WaterfallRow;
  group?: GroupedRows;
  /** Zebra-stripe index (rows only) */
  rowIndex: number;
  /** Whether group is collapsed (group-headers only) */
  isCollapsed?: boolean;
}
