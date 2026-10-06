import type { LevelTone } from "@/features/explorer/endpoint-metrics";

/**
 * How a graph node's edge tells its health: a node in trouble is edged in
 * its colour, a healthy one keeps the plain edge, and one with no traffic
 * yet is dashed. The legend draws its keys with the same edges.
 *
 * @example
 * ```tsx
 * <span className={cn("border", LEVEL_EDGE.warn)} />
 * ```
 */
export const LEVEL_EDGE: Readonly<Record<LevelTone, string>> = {
  ok: "border-line",
  warn: "border-warn/60",
  err: "border-err/65",
  muted: "border-dashed border-line-strong",
};
