/**
 * Who may talk to Studio.
 *
 * Studio listens on the developer's own machine, so every page they have open
 * can reach it. Socket.IO's `cors` option only sets headers on polling
 * responses and refuses no WebSocket, so without these checks any site could
 * join the UI namespace, watch every captured request, and drive the
 * playground and the mock servers.
 *
 * A caller that sends no `Origin` is not a page — a runtime in Node, curl, a
 * script — and is let through: a browser always names its origin.
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

  const isOwnPage = (origin: string, host: string | undefined): boolean => {
    if (host === undefined) return false;
    const requested = host.toLowerCase();
    if (origin !== `http://${requested}`) return false;
    const hostname = unbracket(requested.replace(/:\d+$/, ""));
    return isIpLiteral(hostname) || isLoopbackHostname(hostname) || hostname === bindHost;
  };

  const isUiCaller = (origin: string | undefined, host: string | undefined): boolean => {
    if (origin === undefined) return true;
    const normalized = origin.toLowerCase();
    return extra.has(normalized) || isOwnPage(normalized, host);
  };

  return {
    isUiCaller,
    isRuntimeCaller: (origin, host) =>
      isUiCaller(origin, host) || (origin !== undefined && isLoopbackOrigin(origin)),
  };
}

function isLoopbackOrigin(origin: string): boolean {
  if (!URL.canParse(origin)) return false;
  const url = new URL(origin);
  return (
    (url.protocol === "http:" || url.protocol === "https:") && isLoopbackHostname(url.hostname)
  );
}
