// ── Layout config (dagre) ───────────────────────────────────────────────────

export const LAYOUT_CONFIG = {
  rankSep: 200,
  nodeSep: 60,
  marginX: 40,
  marginY: 40,
} as const;

export const NODE_DIMENSIONS = {
  source: { width: 240, height: 100 },
  group: { width: 220, height: 80 },
  endpoint: { width: 280, height: 72 },
} as const;

// ── Health thresholds ───────────────────────────────────────────────────────

export const SUCCESS_RATE_GOOD = 95;
export const SUCCESS_RATE_WARN = 80;
export const RESPONSE_TIME_GOOD_MS = 200;
export const RESPONSE_TIME_WARN_MS = 500;

/** Seconds since last request to consider a node "active" */
export const ACTIVE_THRESHOLD_MS = 30_000;

// ── Node colors (CSS custom properties → theme-aware) ─────────────────────

export const NODE_COLORS = {
  source: {
    bg: "var(--graph-node-source-bg)",
    border: "var(--graph-node-source-border)",
  },
  group: {
    bg: "var(--graph-node-group-bg)",
    border: "var(--graph-node-group-border)",
  },
  endpoint: {
    bg: "var(--graph-node-ep-bg)",
    border: "var(--graph-node-ep-border)",
  },
} as const;

// ── Health colors ───────────────────────────────────────────────────────────

export const HEALTH_COLORS = {
  healthy: "var(--success-foreground)",
  degraded: "var(--warning-foreground)",
  critical: "var(--destructive-foreground)",
  inactive: "var(--muted-foreground)",
} as const;

// ── HTTP method badge colors (tailwind classes) ─────────────────────────────

export const HTTP_METHOD_COLORS: Record<string, string> = {
  GET: "text-emerald-400 bg-emerald-400/10",
  POST: "text-sky-400 bg-sky-400/10",
  PUT: "text-amber-400 bg-amber-400/10",
  PATCH: "text-violet-400 bg-violet-400/10",
  DELETE: "text-rose-400 bg-rose-400/10",
};

// ── Edge config ─────────────────────────────────────────────────────────────

export const EDGE_CONFIG = {
  strokeWidth: 1.5,
  activeStrokeWidth: 2,
  hoverStrokeWidth: 3,
  particleRadius: 3,
  particleCount: 3,
  baseDuration: 2,
  staggerDelay: 0.7,
} as const;

// ── Endpoint type badge colors ──────────────────────────────────────────────

export const ENDPOINT_TYPE_COLORS = {
  query: "text-sky-400 bg-sky-400/10 border-sky-400/20",
  mutation: "text-amber-400 bg-amber-400/10 border-amber-400/20",
  untyped: "text-zinc-400 bg-zinc-400/10 border-zinc-400/20",
} as const;

// ── Particle animation ─────────────────────────────────────────────────────

export const PARTICLE_CONFIG = {
  size: 3,
  glowRadius: 4,
  speed: 2,
  count: 3,
} as const;
