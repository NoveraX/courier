import type { Tone } from "@/design/tone";
import type { HealthLevel } from "./endpoint-metrics";
import type { ColorMetric } from "./metric-value";

/** Column positions and sizes, and the rows' spacing, as the design lays the graph out. */
export const GRAPH = {
  x: { source: 0, group: 250, endpoint: 500 },
  width: { source: 200, group: 196, endpoint: 300 },
  height: { source: 50, group: 40, endpoint: 40 },
  row: 48,
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
}

export interface GraphEdge {
  id: string;
  path: string;
  tone: "err" | "live" | "plain";
  /** Whether traffic flows along it now: drawn dashed and moving. */
  moving: boolean;
  width: number;
  opacity: number;
}

export interface GraphLayout {
  nodes: GraphNode[];
  edges: GraphEdge[];
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
}
