import type { SegmentKey } from "./types";

// ── Segment visual config ──────────────────────────────────────────────────

interface SegmentConfig {
  label: string;
  /** Tailwind bg class */
  bg: string;
  /** Tailwind text class */
  text: string;
}

export const SEGMENT_CONFIG: Record<SegmentKey, SegmentConfig> = {
  "middleware-req": { label: "Middleware (req)", bg: "bg-violet-500", text: "text-violet-400" },
  "fetch": { label: "Fetch", bg: "bg-sky-500", text: "text-sky-400" },
  "validation": { label: "Validation", bg: "bg-amber-500", text: "text-amber-400" },
  "middleware-res": { label: "Middleware (res)", bg: "bg-purple-500", text: "text-purple-400" },
  "client-to-proxy": { label: "Client → Proxy", bg: "bg-indigo-500", text: "text-indigo-400" },
  "proxy-to-client": { label: "Proxy → Client", bg: "bg-rose-400", text: "text-rose-400" },
} as const;

// ── Layout constants ───────────────────────────────────────────────────────

export const MIN_BAR_HEIGHT = 32;
export const GROUP_HEADER_HEIGHT = 32;
export const RULER_HEIGHT = 24;
export const PROXY_INDENT = 20;
export const LABEL_COLUMN_MIN = 200;
export const LABEL_COLUMN_DEFAULT = 260;
export const ROW_GAP = 2;
export const VIRTUAL_OVERSCAN = 15;

// ── Timeline compression ──────────────────────────────────────────────────

/** Gaps longer than this get compressed */
export const GAP_THRESHOLD_MS = 5_000;

/** Compressed gap renders as this many ms of visual space */
export const GAP_VISUAL_MS = 200;

// ── Zoom ───────────────────────────────────────────────────────────────────

export const ZOOM_LIMITS = { min: 0.5, max: 10 } as const;
export const ZOOM_STEP = 1.5;

// ── Time ruler ─────────────────────────────────────────────────────────────

/** Tick intervals from finest to coarsest (ms) */
export const TICK_INTERVALS = [
  10, 25, 50, 100, 250, 500, 1_000, 2_500, 5_000, 10_000,
  30_000, 60_000, 300_000, 600_000,
] as const;

/** Min pixel gap between ticks */
export const MIN_TICK_GAP_PX = 60;

/** Max number of grid lines to render (DOM performance) */
export const MAX_GRID_LINES = 80;

// ── Base timeline ──────────────────────────────────────────────────────────

/** How many ms map to 1px at zoom=1 */
export const MS_PER_PX_BASE = 2;
