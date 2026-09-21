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
import { ENDPOINT_SCHEMA } from "../define/marker";

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
  const groups: Record<string, Record<string, unknown>> = {};
  const flat: Record<string, unknown> = {};

  for (const [path, shape] of Object.entries(boundary.endpoints)) {
    const separator = path.indexOf(".");
    const endpoint = {
      probe: INERT,
      [ENDPOINT_SCHEMA]: { ...shape },
    };

    if (separator === -1) {
      flat[path] = endpoint;
      continue;
    }

    const group = path.slice(0, separator);
    const method = path.slice(separator + 1);
    groups[group] ??= {};
    groups[group][method] = endpoint;
  }

  const grouped = Object.fromEntries(
    Object.entries(groups).map(([name, endpoints]) => [name, { options: {}, ...endpoints }]),
  );

  return { ...flat, options: { groups: grouped } };
}
