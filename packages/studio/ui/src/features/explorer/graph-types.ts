import type { Tone } from "@/design/tone";
import type { HealthLevel } from "./endpoint-metrics";
import type { ColorMetric } from "./metric-value";
import type { NodeFigure } from "./node-figures";

const HEIGHT = { source: 50, group: 40, endpoint: 40 } as const;

/* The space left between two cards a row apart, the tallest of them included: two sources of one
   endpoint each sit a row apart, and a row shorter than a source's card laid one over the other. */
const ROW_GAP = 10;

/**
 * Column positions and sizes, and the rows' spacing: a source wide enough
 * for its host and port. Each level of groups inside groups takes a column
 * of its own, `step` to the right of the one before, and the endpoints the
 * column after the deepest shown. A row is the tallest card and a gap, so
 * no two cards a row apart touch.
 */
export const GRAPH = {
  x: { source: 0, group: 286, endpoint: 536 },
  width: { source: 236, group: 196, endpoint: 300 },
  height: HEIGHT,
  step: 250,
  row: Math.max(HEIGHT.source, HEIGHT.group, HEIGHT.endpoint) + ROW_GAP,
  top: 52,
} as const;

export interface GraphNode {
  /** `s:` a source, `g:` a group, `e:` an endpoint, then its key. */
  id: string;
  kind: "source" | "group" | "endpoint";
  key: string;
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  sub: string | undefined;
  method: string | undefined;
  value: { text: string; tone: Tone };
  level: HealthLevel;
  active: boolean;
  dim: boolean;
  matched: boolean;
  selected: boolean;
  /** Whether the pointer or the focus is on it. */
  hovered: boolean;
  /** Its whole name or address, as its card may cut it short: a source's base URL, an endpoint's method and path. */
  detail: string;
  /** What its calls add up to, as its card shows on hover. */
  figures: readonly NodeFigure[];
  /** A group with anything inside it: whether it is folded, and how many endpoints that hides. */
  fold?: { folded: boolean; hidden: number } | undefined;
}

export interface GraphEdge {
  id: string;
  path: string;
  tone: "err" | "live" | "plain";
  opacity: number;
}

/** The way a call travels to an endpoint: from its source, through its groups, to it — or to the folded group it is in. */
export interface GraphBranch {
  path: string;
  /** About how long the way is, in the graph's units. */
  length: number;
}

export interface GraphLayout {
  nodes: GraphNode[];
  edges: GraphEdge[];
  /** Each endpoint's branch, by the endpoint's key. */
  branches: ReadonlyMap<string, GraphBranch>;
  width: number;
  height: number;
  columns: { x: number; label: string }[];
}

export interface GraphOptions {
  metric: ColorMetric;
  slowMs: number;
  query: string;
  hover: string | undefined;
  selected: string | undefined;
  /** The groups folded, by key: each shows as one card, the groups and endpoints inside it hidden. */
  folded?: ReadonlySet<string> | undefined;
}
