import { isIPv4 } from "node:net";

/**
 * Whether `NO_PROXY` names a host, read as Node's own `http` and `https`
 * requests read it: `*` for every host; a name or an address exactly, alone
 * or with its port; a domain and every name under it, written
 * `.corp.example`; only the names under one, written `*.corp.example`; and a
 * range of IPv4 addresses, written `10.0.0.1-10.0.0.255`. Entries are
 * separated by commas, and case does not matter.
 *
 * @param list - The value of `NO_PROXY`
 * @param hostname - The host, without brackets
 * @param port - The port the request goes to, the scheme's own when the URL names none
 * @returns Whether the request goes to the host directly rather than through the proxy
 * @example
 * ```ts
 * noProxyMatches(".corp.example, localhost", "specs.corp.example", 443); // true
 * ```
 */
export function noProxyMatches(list: string, hostname: string, port: number): boolean {
  const host = hostname.toLowerCase();
  const hostWithPort = `${host}:${port}`;
  return list
    .split(",")
    .some((entry) => entryMatches(entry.trim().toLowerCase(), host, hostWithPort));
}

function entryMatches(entry: string, host: string, hostWithPort: string): boolean {
  if (entry === "*" || entry === host || entry === hostWithPort) return true;
  if (entry.startsWith(".")) return host === entry.slice(1) || host.endsWith(entry);
  if (entry.startsWith("*.")) return host.endsWith(entry.slice(1));
  return entry.includes("-") && isIPv4(host) && inRange(entry, host);
}

function inRange(entry: string, host: string): boolean {
  const [start = "", end = ""] = entry.split("-").map((part) => part.trim());
  if (!isIPv4(start) || !isIPv4(end)) return false;
  const value = ipv4Number(host);
  return value >= ipv4Number(start) && value <= ipv4Number(end);
}

function ipv4Number(address: string): number {
  return address.split(".").reduce((value, octet) => value * 256 + Number(octet), 0);
}
