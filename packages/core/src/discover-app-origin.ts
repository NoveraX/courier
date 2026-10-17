import { learnAppOrigin } from "./app-origin";
import { isLoopbackAddress } from "./utils/loopback-host";
import { parseUrl } from "./utils/parse-url";

/* The names a request may teach: this machine's own, which no resolver sends elsewhere. */
const LEARNABLE: ReadonlySet<string> = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** What an adapter can tell of a request, for the app's origin to be learned from it. */
export interface AddressedRequest {
  /** Where the adapter saw the request addressed; only its scheme is read */
  readonly url: string | undefined;
  /** The request's own `Host` header */
  readonly host: string | null | undefined;
  /** The port the server accepted the request on, when the adapter can tell */
  readonly serverPort?: number | undefined;
  /** The address the request came from, when the adapter can tell */
  readonly peer?: string | undefined;
}

/**
 * Learn the app's origin from a request a framework adapter serves, unless
 * one is set — config and environment win. Only in development.
 *
 * The Playground sends its calls, their headers and bodies to this origin,
 * so a request teaches it only when it proves it names this very server:
 * its own `Host` is `localhost`, `127.0.0.1` or `[::1]` — never one
 * `X-Forwarded-Host` gives — on the port the server accepted it on, and it
 * came from this machine. Each holds as far as the adapter can tell; one
 * that can tell neither the port nor where the request came from teaches
 * nothing. Adapters call it on every request until one qualifies.
 *
 * @param addressed - What the adapter can tell of the request
 * @example
 * ```ts
 * discoverAppOrigin({ url: request.url, host: request.headers.get("host"), serverPort: 3000 });
 * ```
 */
export function discoverAppOrigin(addressed: AddressedRequest): void {
  const origin = learnableOrigin(addressed);
  if (origin !== undefined) learnAppOrigin(origin);
}

function learnableOrigin(addressed: AddressedRequest): string | undefined {
  const { url, host, serverPort, peer } = addressed;
  const scheme = url === undefined ? undefined : parseUrl(url)?.protocol;
  if (!host || (scheme !== "http:" && scheme !== "https:")) return undefined;
  const named = parseUrl(`${scheme}//${host}`);
  if (!named || !LEARNABLE.has(named.hostname)) return undefined;
  if (serverPort === undefined && peer === undefined) return undefined;
  if (serverPort !== undefined && portOf(named) !== serverPort) return undefined;
  if (peer !== undefined && !isLoopbackAddress(peer)) return undefined;
  return named.origin;
}

function portOf(url: URL): number {
  if (url.port) return Number(url.port);
  return url.protocol === "https:" ? 443 : 80;
}
