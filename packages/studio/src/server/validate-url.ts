/**
 * Decide whether Studio may fetch a specification from a URL.
 *
 * Studio fetches on the developer's behalf, from a machine inside their
 * network. The guard that matters is the one on Studio's own API — a page on
 * another site must not be able to drive it at all — and that lives in
 * `origin-guard.ts`. This is the second line: even a request that really came
 * from the Studio UI does not get to wander the private network.
 *
 * This machine is the exception. A specification served by the project's own
 * dev server is the ordinary case, and refusing it made importing by URL
 * useless exactly where it is most used. Anything else private has to be named
 * in `studio.allowedSpecHosts`.
 */

import { promises as dns } from "node:dns";
import { isIP } from "node:net";

/** Names that always mean this machine. */
const LOOPBACK_HOSTNAMES = new Set(["localhost", "::1", "[::1]"]);

/** Names that mean "every interface", which is not a destination. */
const UNSPECIFIED_HOSTNAMES = new Set(["0.0.0.0", "::", "[::]"]);

/**
 * Validate that a spec URL is safe to fetch.
 *
 * @param url - The URL the developer asked Studio to read
 * @param allowedHosts - Private hosts the project named in its config
 * @throws Error naming the address that was refused
 */
export async function validateSpecUrl(
  url: string,
  allowedHosts: readonly string[] = [],
): Promise<void> {
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    throw new Error("Spec URL must use http:// or https:// protocol");
  }

  const parsed = new URL(url);
  const hostname = parsed.hostname;

  if (isAllowed(parsed, allowedHosts)) return;
  if (LOOPBACK_HOSTNAMES.has(hostname)) return;

  if (UNSPECIFIED_HOSTNAMES.has(hostname)) {
    throw new Error(`Blocked request to unspecified address: ${hostname}`);
  }

  /* An address written out needs no lookup, and looking one up would only
     give a DNS server the chance to answer differently the second time. */
  const bare = hostname.startsWith("[") ? hostname.slice(1, -1) : hostname;
  if (isIP(bare) !== 0) {
    if (isLoopbackIP(bare)) return;
    if (isBlockedIP(bare)) throw refusal(hostname);
    return;
  }

  const { address } = await dns.lookup(hostname);
  if (isLoopbackIP(address)) return;
  if (isBlockedIP(address)) throw refusal(`${hostname} (${address})`);
}

function refusal(what: string): Error {
  return new Error(
    `Blocked request to private address: ${what}. Studio reads a specification ` +
      "on your behalf, so it does not reach into a private network by itself. " +
      "Name the host in `studio.allowedSpecHosts` to allow it.",
  );
}

/** Did the project name this host as one Studio may reach? */
function isAllowed(parsed: URL, allowedHosts: readonly string[]): boolean {
  return allowedHosts.some((entry) => entry === parsed.host || entry === parsed.hostname);
}

/** 127.0.0.0/8 and ::1 — this machine. */
function isLoopbackIP(ip: string): boolean {
  if (ip.toLowerCase() === "::1") return true;
  if (ip.toLowerCase().startsWith("::ffff:")) return isLoopbackIP(ip.slice(7));
  return ip.split(".").map(Number)[0] === 127;
}

/** Check if an IP address belongs to a blocked range */
function isBlockedIP(ip: string): boolean {
  return isBlockedIPv4(ip) || isBlockedIPv6(ip);
}

/**
 * Block IPv4 ranges:
 * - 10.0.0.0/8 (private)
 * - 172.16.0.0/12 (private)
 * - 192.168.0.0/16 (private)
 * - 169.254.0.0/16 (link-local)
 * - 0.0.0.0/8 (unspecified)
 */
function isBlockedIPv4(ip: string): boolean {
  const segments = ip.split(".").map(Number);
  if (segments.length !== 4 || segments.some(Number.isNaN)) return false;

  const [a, b] = segments as [number, number, number, number];
  if (a === 0) return true;
  if (a === 10) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 169 && b === 254) return true;
  return false;
}

/**
 * Block IPv6 ranges:
 * - fe80::/10 (link-local)
 * - fc00::/7 (unique local)
 * - ::ffff:0:0/96 (IPv4-mapped)
 */
function isBlockedIPv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === "::") return true;
  if (lower.startsWith("fe80:")) return true;
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true;
  if (lower.startsWith("::ffff:")) return isBlockedIPv4(lower.slice(7));
  return false;
}
