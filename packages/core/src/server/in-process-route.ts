import type { AdapterHandler } from "../adapter/create-handler";
import type { InProcessRoute } from "../capabilities/in-process-proxy";
import type { ProxyPath } from "../proxy-caller/proxy-path";
import { getSources } from "../registered-sources";
import { serveOnBehalf } from "./session/on-behalf";
import { captureIncomingRequest } from "./session/request-providers";

/* An address that names no other server: the proxy reads a request's path
   and query, and its host rule always serves an address. */
const IN_PROCESS_ORIGIN = "http://127.0.0.1";

/**
 * How a proxy caller on a server reaches its own application's proxy: in
 * the process, when the path is the application's own and the source is
 * registered here. The call then carries the session of the user the
 * server renders for, through the very checks a browser's call goes
 * through, and the cookies the API sets reach that user's response. Over
 * HTTP, the call would carry none of the user's cookies, and need the
 * server's own address.
 *
 * @param proxyPath - The caller's proxy paths
 * @param source - The source the call is for
 * @param proxy - The proxy of the process, made when a call first needs it
 * @returns The route, or `undefined` where the call goes over HTTP
 * @example
 * ```ts
 * const route = inProcessRoute(proxyPath, "api", () => handler);
 * ```
 */
export function inProcessRoute(
  proxyPath: ProxyPath | undefined,
  source: string,
  proxy: () => AdapterHandler,
): InProcessRoute | undefined {
  const path = proxyPath?.http ?? "/api/request";
  if (!path.startsWith("/") || path.startsWith("//")) return undefined;
  if (getSources()?.[source] === undefined) return undefined;
  return {
    url: `${IN_PROCESS_ORIGIN}${path}`,
    incoming: captureIncomingRequest(),
    transport: (served) => (url, init) => {
      const request = new Request(url, init);
      if (served !== undefined) serveOnBehalf(request, served);
      return proxy().handle(request);
    },
  };
}
