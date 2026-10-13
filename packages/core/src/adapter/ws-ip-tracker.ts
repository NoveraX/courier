import { requestClientAddress } from "./client-address";

/** Per-IP connection counter for DDoS/abuse protection */
export interface IPTracker {
  /** Check limit and increment count. Returns true if allowed. */
  acquire(ip: string): boolean;
  /** Decrement count on disconnect */
  release(ip: string): void;
}

/** Names the caller's address when the application can do better than a header. */
export type ClientIPResolver = (request: Request) => string | undefined;

/**
 * Work out which address a connection should be counted against: the
 * user's, as `clientAddress` reads it — the socket's own address unless a
 * proxy in front of the application passed the connection on, and then the
 * one the proxies report. Reading a forwarding header from any caller let a
 * single forged `X-Forwarded-For` switch the cap off, and without the
 * socket's address every direct caller shared one bucket: one client
 * holding its quota locked every other user out.
 *
 * @param request - The upgrade request
 * @param resolve - Supplied by the application when it knows the real address
 * @returns The address to count this connection against
 *
 * @example
 * ```ts
 * // An address the platform reports in a header of its own:
 * createWSHandler({ clientIp: (req) => req.headers.get("fly-client-ip") ?? undefined });
 * ```
 */
export function extractClientIP(request: Request, resolve?: ClientIPResolver): string {
  return resolve?.(request) || requestClientAddress(request) || "0.0.0.0";
}

/**
 * Create a per-IP connection tracker for DDoS/abuse protection.
 * Maintains a Map<ip, count> — increment on connect, decrement on disconnect.
 * When a single IP exceeds `maxPerIP`, new connections are rejected.
 *
 * @param maxPerIP - Maximum concurrent connections allowed per IP (e.g. 50)
 * @returns Tracker with acquire/release methods
 *
 * @example
 * const tracker = createIPTracker(50);
 * if (!tracker.acquire("192.168.1.1")) {
 *   ws.close(4429, "Too many connections");
 * }
 * // On disconnect:
 * tracker.release("192.168.1.1");
 */
export function createIPTracker(maxPerIP: number): IPTracker {
  const counts = new Map<string, number>();

  return {
    acquire(ip) {
      const current = counts.get(ip) ?? 0;
      if (current >= maxPerIP) return false;
      counts.set(ip, current + 1);
      return true;
    },
    release(ip) {
      const current = counts.get(ip) ?? 0;
      if (current <= 1) {
        counts.delete(ip);
      } else {
        counts.set(ip, current - 1);
      }
    },
  };
}
