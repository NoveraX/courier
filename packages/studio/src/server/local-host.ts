import { isIP } from "node:net";

/** Hosts that mean "every interface" when bound. */
export const WILDCARD_HOSTS: ReadonlySet<string> = new Set(["", "0.0.0.0", "::", "[::]"]);

/** A host without the brackets an IPv6 literal carries in a URL or a Host header. */
export function unbracket(host: string): string {
  return host.startsWith("[") && host.endsWith("]") ? host.slice(1, -1) : host;
}

/** Whether a hostname names this machine's loopback: `localhost`, `*.localhost`, 127/8 or ::1. */
export function isLoopbackHostname(hostname: string): boolean {
  const name = unbracket(hostname.toLowerCase());
  if (name === "localhost" || name.endsWith(".localhost") || name === "::1") return true;
  return isIP(name) === 4 && name.startsWith("127.");
}

/** Whether a hostname is an IP address rather than a name DNS could rebind. */
export function isIpLiteral(hostname: string): boolean {
  return isIP(unbracket(hostname)) !== 0;
}
