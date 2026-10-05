/**
 * Turn a proxy boundary into the shape the client's transport picker reads.
 *
 * `composeBackend` asks the source object one question per call — is this
 * endpoint a stream, a channel, or an ordinary request — and a boundary
 * answers exactly that. Handing it a boundary instead of the source is what
 * keeps the upstream host, the middleware and the withheld endpoints out of
 * the browser: they were never in the boundary to begin with.
 *
 * The stand-in carries an inert `probe`, because the resolver recognises an
 * endpoint by having one. Proxy mode never calls it — the backend discards the
 * endpoint and dispatches on the schema alone.
 */

import type { ProxyBoundary } from "../define/boundary-types";
import { GROUP_PATH_SEPARATOR } from "../define/group-tree";
import { ENDPOINT_SCHEMA } from "../validation";

/** Recognised as an endpoint, and never invoked in proxy mode. */
const INERT = (): never => {
  throw new Error("[courier] a boundary describes an endpoint; it cannot execute one");
};

/**
 * Build the object `composeBackend` expects from a boundary.
 *
 * @param boundary - The endpoints the browser may call, with their transports
 * @returns A source-shaped stand-in carrying nothing but those transports
 *
 * @example
 * ```ts
 * createProxyCaller("api", { source: sourceFromBoundary(boundary), proxyPath });
 * ```
 */
export function sourceFromBoundary(boundary: ProxyBoundary): Record<string, unknown> {
  const root = newLevel();
  const sensitive = new Set(boundary.sensitive);
  for (const [path, shape] of Object.entries(boundary.endpoints)) {
    const names = path.split(GROUP_PATH_SEPARATOR);
    const method = names.pop() ?? path;
    const level = names.reduce(levelBelow, root);
    level.endpoints[method] = {
      probe: INERT,
      [ENDPOINT_SCHEMA]: { ...shape },
      ...(sensitive.has(path) && { options: { sensitiveVariables: true } }),
    };
  }
  return sourceOf(root);
}

/* The endpoints at one level of the boundary, and the groups below it. A Map,
   not an object: a group named `valueOf` found Object's own method already
   there, and its endpoints were written onto that. */
interface Level {
  endpoints: Record<string, unknown>;
  groups: Map<string, Level>;
}

function newLevel(): Level {
  return { endpoints: {}, groups: new Map() };
}

function levelBelow(level: Level, name: string): Level {
  const below = level.groups.get(name) ?? newLevel();
  level.groups.set(name, below);
  return below;
}

/* A level written as a source or a group writes it: its endpoints, and its groups under `options`. */
function sourceOf(level: Level): Record<string, unknown> {
  const groups = Object.fromEntries(
    [...level.groups].map(([name, below]) => [name, sourceOf(below)]),
  );
  return { ...level.endpoints, options: { groups } };
}
