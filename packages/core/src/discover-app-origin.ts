import { learnAppOrigin } from "./app-origin";
import { createLogger } from "./logger";
import { isLoopbackHostname } from "./utils/loopback-host";
import { parseUrl } from "./utils/parse-url";

const log = createLogger("Proxy");

/** Where a server itself listens, as its adapter can tell without trusting a request. */
export interface ServerOrigin {
  /** `scheme://host:port` the server is reached at: the socket it accepted the request on, or the framework's own address */
  readonly serverOrigin: string;
}

let warnedOfHostOrigin = false;

/**
 * Learn the app's origin, in development, unless one is set — config and
 * the environment win.
 *
 * The Playground sends its calls, their headers and their bodies to this
 * origin, so it is learned from what the server knows of itself: the local
 * address and port of the socket a request arrived on, or the address a
 * framework serves on. No request header decides it, so neither a page
 * whose name was pointed at this machine nor another process on it can make
 * the Playground's calls go elsewhere.
 *
 * A string is what an adapter from before 0.3.1 sends: the origin a request
 * named in its `Host`, which whoever sends the request chooses. Only this
 * machine's own names — `localhost`, `127.0.0.1`, `[::1]` — are taken from
 * it, which no other machine can answer for, and a warning asks to update
 * the adapter.
 *
 * @param source - What the adapter can tell of where its server listens
 * @example
 * ```ts
 * discoverAppOrigin({ serverOrigin: "http://localhost:3000" });
 * ```
 */
export function discoverAppOrigin(source: ServerOrigin | string | undefined): void {
  if (source === undefined) return;
  if (typeof source !== "string") {
    const own = webOrigin(source.serverOrigin);
    if (own !== undefined) learnAppOrigin(own);
    return;
  }
  const named = parseUrl(source);
  const origin = webOrigin(source);
  if (origin === undefined || !named || !isLoopbackHostname(named.hostname)) return;
  if (learnAppOrigin(origin)) warnOfHostOrigin();
}

/* The origin of an http(s) URL; anything else teaches nothing. */
function webOrigin(url: string): string | undefined {
  const parsed = parseUrl(url);
  if (!parsed || (parsed.protocol !== "http:" && parsed.protocol !== "https:")) return undefined;
  return parsed.origin;
}

function warnOfHostOrigin(): void {
  if (warnedOfHostOrigin) return;
  warnedOfHostOrigin = true;
  log.warn(
    "A Courier adapter from before 0.3.1 named the app's address from a request's Host header. " +
      "Update every @noverax package to the same version so the address comes from the server itself.",
  );
}
