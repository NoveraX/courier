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
 * The boundary does not name the API at all. Taking the source as a runtime
 * argument would pull the whole definition into whatever module declares the
 * boundary, and from there into the bundle — the leak this exists to close.
 * Naming its type would tie the two types in a knot, since the API holds the
 * boundary. So the shape of each endpoint is written out, and the API that
 * takes the boundary checks it: a misspelt path or a wrong shape does not
 * compile there, and a browser client typed from that API reaches only the
 * endpoints the boundary names.
 */

import type { ProxyPath } from "../proxy-caller/proxy-path";
import type { ExposedEndpoint, Exposure, ProxyBoundary } from "./boundary-types";

/** The paths of an exposure that name a read. */
type ReadPath<TExposure> = {
  [P in keyof TExposure]: TExposure[P] extends "query" ? P : never;
}[keyof TExposure] &
  string;

export interface BoundaryConfig<TExposure extends Exposure> {
  /** The source's name in the registry, as `courier.config.ts` keys it. */
  source: string;
  /** Every endpoint the browser may call, with its shape. Absent means refused. */
  expose: TExposure;
  /** Where the app serves its proxy routes, so the client needs nothing else. */
  proxyPath?: ProxyPath;
  /**
   * The reads whose variables stay out of the address: sent as POST, as the
   * definition's `sensitiveVariables` asks. The proxy refuses them over GET.
   */
  sensitive?: readonly ReadPath<TExposure>[];
}

/** How each declared shape reaches the wire. */
const SHAPES: Readonly<Record<string, ExposedEndpoint>> = {
  query: { type: "query" },
  mutation: { type: "mutation" },
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
 * // boundary.ts
 * export const boundary = defineBoundary({
 *   source: "api",
 *   expose: {
 *     "posts.list": "query",
 *     "posts.create": "mutation",
 *     "posts.feed": "stream",
 *     "chat.room": "duplex",
 *   },
 * });
 *
 * // api.ts — the server gates on the boundary its source carries, and checks it:
 * // "posts.lsit" does not compile here, nor "posts.feed": "query", nor
 * // "posts.create": "query", since a POST writes.
 * export const api = defineApi({ baseURL, boundary, groups: { posts, chat, admin } });
 *
 * // In the browser: admin.purge is absent, so it does not compile and is refused.
 * const client = createProxyCaller<typeof api>("api", { boundary });
 * ```
 */
export function defineBoundary<const TExposure extends Exposure>(
  config: BoundaryConfig<TExposure>,
): ProxyBoundary<TExposure> {
  const endpoints: Record<string, ExposedEndpoint> = {};

  for (const [path, shape] of Object.entries(config.expose)) {
    const wire = typeof shape === "string" ? SHAPES[shape] : undefined;
    if (wire) endpoints[path] = { ...wire };
  }

  return {
    source: config.source,
    endpoints,
    ...(config.proxyPath === undefined ? {} : { proxyPath: config.proxyPath }),
    ...(config.sensitive?.length ? { sensitive: [...config.sensitive] } : {}),
  };
}
