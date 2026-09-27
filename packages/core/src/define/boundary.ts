/**
 * Declare what a browser may call through the proxy.
 *
 * The proxy addresses endpoints by name, and resolves that name against every
 * source the application declared — including the ones only server code was
 * meant to call. A boundary is where an application says which of them the
 * browser is allowed to reach, once, in a place a reviewer can read.
 *
 * The same declaration does both halves of the job. The server refuses
 * anything it does not name, answering exactly as it answers an unknown name,
 * once the API it gates carries it as `defineApi({ boundary })`.
 * The browser receives it *instead of* the source object, so the bundle
 * carries the names that were opened and nothing else — no upstream host, no
 * middleware, no path of an endpoint that was kept back.
 *
 * The API is named in type position only. That is the point rather than a
 * detail: taking the source as a runtime argument would pull the whole
 * definition into whatever module declares the boundary, and from there into
 * the bundle — which is the leak this exists to close. So the shape of each
 * endpoint is written out and checked against the type instead of read off
 * the value, and naming the wrong one does not compile.
 */

import type { ProxyPath } from "../proxy-caller/proxy-path";
import type { ExposedEndpoint, ExposureMap, ProxyBoundary } from "./boundary-types";

export interface BoundaryConfig<TApi> {
  /** The source's name in the registry, as `courier.config.ts` keys it. */
  source: string;
  /** Every endpoint the browser may call, with its shape. Absent means refused. */
  expose: ExposureMap<TApi>;
  /** Where the app serves its proxy routes, so the client needs nothing else. */
  proxyPath?: ProxyPath;
}

/** How each declared shape reaches the wire. */
const SHAPES: Readonly<Record<string, ExposedEndpoint>> = {
  request: {},
  stream: { transport: "sse" },
  channel: { transport: "ws" },
  duplex: { transport: "ws", bidirectional: true },
};

/**
 * Declare the proxy boundary for one source.
 *
 * @param config - The source's registry name and the endpoints to expose
 * @returns The descriptor the server gates on and the browser receives
 *
 * @example
 * ```ts
 * // boundary.ts — annotated, because the API below holds it in turn
 * import type { api } from "./api";
 *
 * export const boundary: ProxyBoundary = defineBoundary<typeof api>({
 *   source: "api",
 *   expose: {
 *     "posts.list": "request",
 *     "posts.feed": "stream",
 *     "chat.room": "duplex",
 *   },
 * });
 * // "posts.lsit" — does not compile. "posts.feed": "request" — does not compile.
 * // "admin.purge" — absent, so refused at runtime and unknown to the browser.
 *
 * // api.ts — the server gates on the boundary its source carries
 * export const api = defineApi({ baseURL, boundary, groups: { posts, chat, admin } });
 * ```
 */
export function defineBoundary<TApi>(config: BoundaryConfig<TApi>): ProxyBoundary {
  const endpoints: Record<string, ExposedEndpoint> = {};

  for (const [path, shape] of Object.entries(config.expose)) {
    const wire = typeof shape === "string" ? SHAPES[shape] : undefined;
    if (wire) endpoints[path] = { ...wire };
  }

  return {
    source: config.source,
    endpoints,
    ...(config.proxyPath === undefined ? {} : { proxyPath: config.proxyPath }),
  };
}
