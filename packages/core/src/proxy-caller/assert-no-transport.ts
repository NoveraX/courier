import { ConfigurationError } from "../errors";
import { TRANSPORT_KEYS } from "../http-client/transport-options";

/**
 * Refuse, on a call through the proxy, the options that say how a call
 * reaches its server — `fetch`, `webSocket`, `dispatcher`, Bun's `proxy`
 * and `tls`, Deno's `client`. The server sends a proxy call, through its
 * source's or its group's own; given here, they would reach only the hop
 * to the proxy route, and the API would be called without them.
 *
 * @param options - The call's options, as `.with()` gave them
 * @throws {ConfigurationError} `PROXY_OPTION_NOT_ALLOWED` naming each one that is set
 * @example
 * ```ts
 * assertNoProxyTransport({ headers }); // passes
 * assertNoProxyTransport({ dispatcher }); // throws
 * ```
 */
export function assertNoProxyTransport(
  options: Readonly<Record<string, unknown>> | undefined,
): void {
  if (options === undefined) return;
  const set = TRANSPORT_KEYS.filter((key) => options[key] !== undefined);
  if (set.length === 0) return;
  const names = set.map((key) => `\`${key}\``).join(", ");
  throw new ConfigurationError(
    "PROXY_OPTION_NOT_ALLOWED",
    `[courier] ${names} cannot be set on a call through the proxy: the server sends it, with its API's or its group's own. Set ${set.length === 1 ? "it" : "them"} in the API's or the group's definition, or call the API with createCaller where the call is sent.`,
  );
}
