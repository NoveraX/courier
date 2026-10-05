/**
 * The groups and endpoints a client can reach, read from its source.
 */

import type { ProxyBoundary } from "../define/boundary-types";
import { subGroupsOf } from "../define/group-tree";
import { sourceFromBoundary } from "../proxy-caller/from-boundary";

/** What a source, or one of its groups, says a client may call there. */
export interface ClientShape {
  /** Each group inside it, with its own shape: its endpoints, and the groups inside it. */
  groups: ReadonlyMap<string, ClientShape>;
  /** Endpoints called at this level. */
  endpoints: ReadonlySet<string>;
}

/**
 * Read the shape of a `defineApi` result, or of the source a boundary stands for.
 *
 * @param source - The source, when the client was given one
 * @returns The shape, or `undefined` when the client knows only a name
 *
 * @example
 * ```ts
 * shapeOfSource(api)?.groups.get("users")?.endpoints; // → Set { "list", "getById" }
 * shapeOfSource(api)?.groups.get("billing")?.groups.get("invoices"); // → the shape of billing.invoices
 * ```
 */
export function shapeOfSource(
  source: Record<string, unknown> | undefined,
): ClientShape | undefined {
  return source ? shapeAt(source) : undefined;
}

/* A source's or a group's shape, the groups inside it read the same way. */
function shapeAt(holder: Record<string, unknown>): ClientShape {
  const groups = new Map<string, ClientShape>();
  for (const [name, group] of subGroupsOf(holder)) groups.set(name, shapeAt(group));
  return { groups, endpoints: new Set(endpointNames(holder)) };
}

/**
 * Read the shape of a client from what it was given: a boundary, or the
 * source itself. A boundary wins where both are, as it does for the
 * client's transports.
 *
 * @param given - The client's `boundary` and `source`, either of them optional
 * @returns The shape, or `undefined` when the client was given neither
 *
 * @example
 * ```ts
 * shapeOfClient({ boundary })?.groups.get("users")?.endpoints; // → the methods it exposes
 * ```
 */
export function shapeOfClient(given: {
  source?: Record<string, unknown> | undefined;
  boundary?: ProxyBoundary | undefined;
}): ClientShape | undefined {
  return shapeOfSource(given.boundary ? sourceFromBoundary(given.boundary) : given.source);
}

function endpointNames(record: Record<string, unknown>): string[] {
  return Object.keys(record).filter(
    (key) => key !== "options" && typeof record[key] === "object" && record[key] !== null,
  );
}
