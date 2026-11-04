/**
 * One host rule for every entry point the adapter serves.
 *
 * The origin rule cannot see DNS rebinding. A page on the attacker's name
 * points that name at the machine the app runs on, and its requests are then
 * addressed to the app under the attacker's name: the browser calls them
 * same-origin, a plain-HTTP page sends no `Sec-Fetch-Site`, and `Origin`
 * matches the name the request was addressed to. Only the app knowing its own
 * names can refuse it, so a request for any other name is answered 421
 * Misdirected Request.
 *
 * Loopback names and IP literals are always served: a page on one of them is
 * on the user's own machine or at an address nobody can point elsewhere.
 * Anything else is served when `allowedHosts` names it — as the config lists
 * it, as its function answers when the first request comes in, or as
 * `COURIER_ALLOWED_HOSTS` does; see `readAllowedHosts`. Left unconfigured,
 * development serves nothing else — a rebound name reaches a developer's
 * server as easily as any — while production keeps serving every name, since
 * a production host is reached through names its operator set up. While the
 * setting cannot be read, nothing is served: a mistake in it closes the
 * application rather than opening it.
 */

import { parseUrl } from "../utils/parse-url";
import { type HostNames, isHostNamed } from "./host-names";
import { type AllowedHostsSetting, readAllowedHosts, reportUnreadSetting } from "./runtime-policy";

/**
 * Decide whether a request was addressed to a host this app serves.
 *
 * @param request - The incoming request, whose URL names the host it was
 *   addressed to
 * @param allowedHosts - The app's own host names; see {@link isHostAccepted}
 * @returns Whether the request may proceed
 *
 * @example
 * ```ts
 * isHostAllowed(request, ["app.example.com", "*.example.com"]);
 * isHostAllowed(request, () => [new URL(process.env.APP_URL ?? "").host]);
 * ```
 */
export function isHostAllowed(request: Request, allowedHosts?: AllowedHostsSetting): boolean {
  return isHostAccepted(new URL(request.url).host, allowedHosts);
}

/**
 * The same rule, for a server that speaks in parts rather than in `Request`.
 *
 * An entry is a host name — `app.example.com`, a port after it read past —
 * or `*.example.com` for the sub-domains of one, not the name itself. Names
 * match in any case, and on any port. A setting that cannot be read admits
 * no request at all, and says why in the log, once.
 *
 * @param host - The host the request was addressed to, with or without a
 *   port; absent from a client that is not a browser
 * @param allowedHosts - The app's own host names: a list, a function, or
 *   none, which leaves them to `COURIER_ALLOWED_HOSTS`
 * @returns Whether the request may proceed
 *
 * @example
 * ```ts
 * isHostAccepted("localhost:3000"); // → true
 * isHostAccepted("rebound.example:3000"); // → false outside production
 * isHostAccepted("app.example.com", ["app.example.com"]); // → true
 * ```
 */
export function isHostAccepted(
  host: string | null | undefined,
  allowedHosts?: AllowedHostsSetting,
): boolean {
  const hosts = readAllowedHosts(allowedHosts);
  if (hosts.ok) return isHostServed(host, hosts.value);
  reportUnreadSetting(hosts.error);
  return false;
}

/**
 * The same rule, for names already read: what an entry point that tells a
 * setting it cannot read from a host it does not serve decides with.
 *
 * @param host - The host the request was addressed to, with or without a port
 * @param hosts - The names `readAllowedHosts` read, or none when nothing sets them
 * @returns Whether the request may proceed
 *
 * @example
 * ```ts
 * const hosts = readAllowedHosts(config.allowedHosts);
 * if (hosts.ok && !isHostServed(new URL(request.url).host, hosts.value)) return refuseHost(request);
 * ```
 */
export function isHostServed(
  host: string | null | undefined,
  hosts: HostNames | undefined,
): boolean {
  /* Every browser sends a host; a caller without one is not a page. */
  if (!host) return true;
  const name = hostnameOf(host);
  if (name === undefined) return false;
  if (isAlwaysServed(name)) return true;
  if (hosts !== undefined) return isHostNamed(name, hosts);
  return process.env.NODE_ENV === "production";
}

/** The host name alone, as the URL parser normalizes it, or nothing for a malformed host. */
function hostnameOf(host: string): string | undefined {
  return parseUrl(`http://${host}`)?.hostname;
}

/**
 * Loopback names and IP literals. The URL parser writes every IPv4 form as
 * four decimal parts and brackets an IPv6 address, so these two shapes are
 * all an address can take here.
 */
function isAlwaysServed(name: string): boolean {
  if (name === "localhost" || name.endsWith(".localhost")) return true;
  return name.startsWith("[") || /^\d+\.\d+\.\d+\.\d+$/.test(name);
}
