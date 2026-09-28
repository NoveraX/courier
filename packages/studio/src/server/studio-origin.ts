/**
 * Who may talk to Studio.
 *
 * Studio listens on the developer's own machine, so every page they have open
 * can reach it. Socket.IO's `cors` option only sets headers on polling
 * responses and refuses no WebSocket, so without these checks any site could
 * join the UI namespace, watch every captured request, and drive the
 * playground and the mock servers.
 *
 * A caller that sends no `Origin` is a process — a runtime in Node, curl, a
 * script — or a browser sending a same-origin GET. It is taken as a runtime,
 * and as the UI only when the Host it sent cannot have been rebound: a page
 * on a domain rebound to this machine sends that domain.
 */

import { isIpLiteral, isLoopbackHostname, unbracket } from "./local-host";

/** The two kinds of caller Studio tells apart. */
export interface StudioOriginPolicy {
  /** The Studio UI: its own page, or an origin listed as one. */
  isUiCaller(origin: string | undefined, host: string | undefined): boolean;
  /** A runtime: also any page served from this machine, where the developer's apps run. */
  isRuntimeCaller(origin: string | undefined, host: string | undefined): boolean;
}

/**
 * Build the policy for a Studio bound to `bindHost`.
 *
 * Studio's own page is recognised by its origin naming the very host the
 * request was sent to, as long as that host cannot have been rebound: an IP
 * address, a loopback name, or the host Studio was told to bind. A page from
 * a rebound domain names that domain and is refused.
 *
 * @param options - `bindHost` as configured; `extraOrigins` accepted as the UI.
 * @returns The policy.
 */
export function createStudioOriginPolicy(options: {
  bindHost: string;
  extraOrigins: readonly string[];
}): StudioOriginPolicy {
  const extra = new Set(options.extraOrigins.map((origin) => origin.toLowerCase()));
  const bindHost = unbracket(options.bindHost.toLowerCase());

  /* A Host that names an address or this machine, or the host Studio bound: nothing DNS could rebind. */
  const isFixedHost = (host: string): boolean => {
    const hostname = unbracket(host.toLowerCase().replace(/:\d+$/, ""));
    return isIpLiteral(hostname) || isLoopbackHostname(hostname) || hostname === bindHost;
  };

  const isOwnPage = (origin: string, host: string | undefined): boolean =>
    host !== undefined && origin === `http://${host.toLowerCase()}` && isFixedHost(host);

  /* Without an Origin, the caller is a process, or a browser sending a same-origin GET — from a rebound domain, it names that domain as the Host. */
  const isUiCaller = (origin: string | undefined, host: string | undefined): boolean => {
    if (origin === undefined) return host === undefined || isFixedHost(host);
    const normalized = origin.toLowerCase();
    return extra.has(normalized) || isOwnPage(normalized, host);
  };

  /* A process may reach Studio by any name, from a container say; a page must be on this machine. */
  return {
    isUiCaller,
    isRuntimeCaller: (origin, host) =>
      origin === undefined || isUiCaller(origin, host) || isLoopbackOrigin(origin),
  };
}

function isLoopbackOrigin(origin: string): boolean {
  if (!URL.canParse(origin)) return false;
  const url = new URL(origin);
  return (
    (url.protocol === "http:" || url.protocol === "https:") && isLoopbackHostname(url.hostname)
  );
}
