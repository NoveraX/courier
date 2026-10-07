import type { AdapterHandler } from "../adapter/create-handler";
import type { IncomingRequest } from "../session/incoming-request";
import { serveOnBehalf } from "../session/on-behalf";
import { captureIncomingRequest } from "../session/request-context";
import { getSources } from "../sources";
import { servesOneUser } from "../utils/serves-one-user";
import type { ProxyPath } from "./proxy-path";

/* An address that names no other server: the proxy reads a request's path
   and query, and its host rule always serves an address. */
const IN_PROCESS_ORIGIN = "http://127.0.0.1";

/** The way to the proxy of the server a caller runs in, without leaving the process. */
export interface InProcessRoute {
  /** The proxy's address, its path the configured one */
  readonly url: string;
  /** The request being served, found as the call started; waited for before the call is sent */
  readonly incoming: IncomingRequest | Promise<IncomingRequest | undefined> | undefined;
  /** Sends a proxy request to the proxy in this process, made for `served` */
  transport(
    served: IncomingRequest | undefined,
  ): (url: string, init: RequestInit) => Promise<Response>;
}

/**
 * How a proxy caller on a server reaches its own application's proxy: in
 * the process, when the path is the application's own and the source is
 * registered here. A page rendered on the server — universal code in Nuxt,
 * SvelteKit or an App Router — then calls with the session of the user it
 * renders for, through the very checks a browser's call goes through, and
 * the cookies the API sets reach that user's response. Over HTTP, the call
 * would carry none of the user's cookies, and need the server's own address.
 *
 * @param proxyPath - The caller's proxy paths
 * @param source - The source the call is for
 * @returns The route, or `undefined` where the call goes over HTTP
 * @example
 * ```ts
 * const route = inProcessRoute(proxyPath, "api");
 * ```
 */
export function inProcessRoute(
  proxyPath: ProxyPath | undefined,
  source: string,
): InProcessRoute | undefined {
  if (servesOneUser()) return undefined;
  const path = proxyPath?.http ?? "/api/request";
  if (!path.startsWith("/") || path.startsWith("//")) return undefined;
  if (getSources()?.[source] === undefined) return undefined;
  return {
    url: `${IN_PROCESS_ORIGIN}${path}`,
    incoming: captureIncomingRequest(),
    transport: (served) => async (url, init) => {
      const request = new Request(url, init);
      if (served !== undefined) serveOnBehalf(request, served);
      return (await inProcessProxy()).handle(request);
    },
  };
}

let proxy: Promise<AdapterHandler> | undefined;

/* Loaded with the first call made in process: a browser bundle never loads
   the proxy. The limits it puts on a browser's body are no limits on what
   the server's own code sends it. */
function inProcessProxy(): Promise<AdapterHandler> {
  proxy ??= import("../adapter/create-handler").then(({ createHandler }) =>
    createHandler({
      maxBodyBytes: Number.MAX_SAFE_INTEGER,
      maxUploadBytes: Number.MAX_SAFE_INTEGER,
    }),
  );
  return proxy;
}
