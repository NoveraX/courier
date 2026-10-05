import type { EndpointMetrics, HealthLevel } from "./endpoint-metrics";
import type { NodeContext } from "./endpoint-node";
import type { EndpointNode, GroupNode } from "./explorer-model";

/** What a list of endpoints adds up to. */
export type RollUp = (
  endpoints: readonly EndpointNode[],
  ctx: NodeContext,
) => { metrics: EndpointMetrics; level: HealthLevel };

/**
 * Every group path of a source in tree order — a group right before the
 * groups inside it — a group named only by the groups inside it included,
 * so each has a parent to sit under.
 *
 * @param named - The group paths the catalogue names, `""` among them for none
 * @returns The paths, `""` left out
 * @example
 * ```ts
 * groupPaths(["billing.invoices", "users"]); // → ["billing", "billing.invoices", "users"]
 * ```
 */
export function groupPaths(named: Iterable<string>): string[] {
  const paths = new Set<string>();
  for (const path of named) {
    const names = path ? path.split(".") : [];
    for (let depth = 1; depth <= names.length; depth++) paths.add(names.slice(0, depth).join("."));
  }
  return [...paths].sort(byTreeOrder);
}

/* Name by name, so a group comes right before the groups inside it. */
function byTreeOrder(a: string, b: string): number {
  const [left, right] = [a.split("."), b.split(".")];
  for (let i = 0; i < Math.min(left.length, right.length); i++) {
    const order = (left[i] ?? "").localeCompare(right[i] ?? "");
    if (order !== 0) return order;
  }
  return left.length - right.length;
}

/**
 * A group as the Explorer shows it: its own endpoints, where it sits, and
 * the metrics of its whole subtree.
 *
 * @param source - The source's name
 * @param path - The group's path
 * @param own - Each group's own endpoints, by path
 * @param ctx - What the metrics are read against
 * @param rollUp - Adds up a list of endpoints
 * @returns The group
 * @example
 * ```ts
 * groupOf("api", "billing.invoices", own, ctx, rollUp).parent; // → "api.billing"
 * ```
 */
export function groupOf(
  source: string,
  path: string,
  own: ReadonlyMap<string, EndpointNode[]>,
  ctx: NodeContext,
  rollUp: RollUp,
): GroupNode {
  const names = path.split(".");
  const subtree = [...own].flatMap(([at, endpoints]) =>
    at === path || at.startsWith(`${path}.`) ? endpoints : [],
  );
  return {
    key: `${source}.${path}`,
    source,
    name: names.at(-1) ?? path,
    path,
    depth: names.length - 1,
    parent: names.length > 1 ? `${source}.${names.slice(0, -1).join(".")}` : undefined,
    endpoints: own.get(path) ?? [],
    subtree,
    ...rollUp(subtree, ctx),
  };
}
