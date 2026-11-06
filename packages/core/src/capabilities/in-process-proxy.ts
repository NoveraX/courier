import type { ProxyPath } from "../proxy-caller/proxy-path";
import type { IncomingRequest } from "../session/incoming-request";

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
 * The proxy of this process, as a proxy caller on its server reaches it: a
 * page rendered on the server — universal code in Nuxt, SvelteKit or an
 * App Router — then calls with the session of the user it renders for,
 * through the very checks a browser's call goes through.
 */
export interface InProcessProxyCapability {
  /**
   * The route to the proxy for one call, found as the call starts.
   *
   * @param proxyPath - The caller's proxy paths
   * @param source - The source the call is for
   * @returns The route, or `undefined` where the call goes over HTTP
   */
  route(proxyPath: ProxyPath | undefined, source: string): InProcessRoute | undefined;
}
