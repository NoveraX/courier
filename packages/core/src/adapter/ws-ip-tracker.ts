/** Per-IP connection counter for DDoS/abuse protection */
export interface IPTracker {
  /** Check limit and increment count. Returns true if allowed. */
  acquire(ip: string): boolean;
  /** Decrement count on disconnect */
  release(ip: string): void;
}

/**
 * Extract client IP from request headers (proxy-aware).
 * Checks headers in order: X-Forwarded-For → CF-Connecting-IP → X-Real-IP → "0.0.0.0".
 *
 * ⚠️ Trusts proxy headers — only use behind a trusted reverse proxy.
 * Direct clients can spoof these headers.
 *
 * @param request - WebSocket upgrade request
 * @returns Client IP address string
 *
 * @example
 * const ip = extractClientIP(request); // "192.168.1.1"
 */
export function extractClientIP(request: Request): string {
  const forwarded = request.headers.get("X-Forwarded-For");
  if (forwarded) return forwarded.split(",")[0]!.trim();

  const cfIP = request.headers.get("CF-Connecting-IP");
  if (cfIP) return cfIP;

  const realIP = request.headers.get("X-Real-IP");
  if (realIP) return realIP;

  return "0.0.0.0";
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
