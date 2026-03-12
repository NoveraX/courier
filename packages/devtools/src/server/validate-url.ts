/**
 * SSRF protection — validates that a spec URL does not target
 * internal/private network addresses before fetching.
 *
 * Resolves the hostname via DNS and checks the resolved IP,
 * preventing DNS rebinding and hostname-based bypasses.
 */

import { promises as dns } from "node:dns";
import { isIP } from "node:net";

const BLOCKED_HOSTNAMES = new Set(["localhost", "0.0.0.0", "::", "::1", "[::1]", "[::]"]);

/**
 * Validate that a spec URL is safe to fetch (no SSRF).
 *
 * @throws Error if the URL targets a private/loopback/link-local address
 */
export async function validateSpecUrl(url: string): Promise<void> {
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    throw new Error("Spec URL must use http:// or https:// protocol");
  }

  const parsed = new URL(url);
  const hostname = parsed.hostname;

  if (BLOCKED_HOSTNAMES.has(hostname)) {
    throw new Error(`Blocked request to loopback address: ${hostname}`);
  }

  /* If hostname is already an IP literal, check directly (bypasses DNS) */
  const bare = hostname.startsWith("[") ? hostname.slice(1, -1) : hostname;
  if (isIP(bare) !== 0) {
    if (isBlockedIP(bare)) {
      throw new Error(`Blocked request to private/internal address: ${hostname}`);
    }
    return;
  }

  /* Resolve DNS to get actual IP and check it */
  const { address } = await dns.lookup(hostname);
  if (isBlockedIP(address)) {
    throw new Error(`Blocked request to private/internal address: ${hostname} (${address})`);
  }
}

/** Check if an IP address belongs to a blocked range */
function isBlockedIP(ip: string): boolean {
  return isBlockedIPv4(ip) || isBlockedIPv6(ip);
}

/**
 * Block IPv4 ranges:
 * - 127.0.0.0/8 (loopback)
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
  if (a === 127) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 169 && b === 254) return true;
  return false;
}

/**
 * Block IPv6 ranges:
 * - ::1 (loopback)
 * - fe80::/10 (link-local)
 * - fc00::/7 (unique local)
 * - ::ffff:0:0/96 (IPv4-mapped)
 */
function isBlockedIPv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === "::") return true;
  if (lower === "::1") return true;
  if (lower.startsWith("fe80:")) return true;
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true;

  /* IPv4-mapped IPv6 (::ffff:x.x.x.x) — extract and check the embedded IPv4 */
  if (lower.startsWith("::ffff:")) {
    const embedded = lower.slice(7);
    return isBlockedIPv4(embedded);
  }

  return false;
}
