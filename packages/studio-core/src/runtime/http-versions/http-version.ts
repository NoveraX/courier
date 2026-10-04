import type { HttpVersion } from "../../events/http";

/** What a runtime knows of the HTTP versions its requests went over. */
export interface HttpVersions {
  /** The version requests to this URL's origin go over, when this runtime has seen one. */
  versionOf(url: string): HttpVersion | undefined;
  /** Stop watching. */
  dispose(): void;
}

/* How many origins a runtime remembers: the ones it calls are few, and the
   oldest is let go first. */
const MAX_ORIGINS = 256;

/**
 * The HTTP version a protocol name stands for: an ALPN id as a TLS socket
 * negotiated it, or a browser's `nextHopProtocol`.
 *
 * @param protocol - The protocol's name, such as `h2` or `http/1.1`
 * @returns The version, or `undefined` for a name that is none of them
 * @example
 * ```ts
 * httpVersionFromProtocol("h2"); // → "HTTP/2"
 * ```
 */
export function httpVersionFromProtocol(protocol: string): HttpVersion | undefined {
  const name = protocol.toLowerCase();
  if (name === "http/1.1") return "HTTP/1.1";
  if (name === "http/1.0") return "HTTP/1.0";
  if (name === "h2" || name === "h2c") return "HTTP/2";
  if (name === "h3" || name.startsWith("h3-")) return "HTTP/3";
  return undefined;
}

/**
 * The origin a URL names, for looking its HTTP version up.
 *
 * @param url - The URL
 * @returns Its origin, or `undefined` for a URL that does not parse
 * @example
 * ```ts
 * originOf("https://api.example.com/users?page=2"); // → "https://api.example.com"
 * ```
 */
export function originOf(url: string): string | undefined {
  return URL.canParse(url) ? new URL(url).origin : undefined;
}

/**
 * A record of the HTTP version each origin was last reached over, the
 * oldest origin forgotten once there are many.
 *
 * @returns What notes a version and looks one up
 * @example
 * ```ts
 * const versions = originVersions();
 * versions.note("https://api.example.com", "HTTP/2");
 * versions.versionOf("https://api.example.com/users"); // → "HTTP/2"
 * ```
 */
export function originVersions(): {
  note(origin: string, version: HttpVersion): void;
  versionOf(url: string): HttpVersion | undefined;
} {
  const byOrigin = new Map<string, HttpVersion>();
  return {
    note(origin, version) {
      byOrigin.delete(origin);
      byOrigin.set(origin, version);
      const [oldest] = byOrigin.keys();
      if (byOrigin.size > MAX_ORIGINS && oldest !== undefined) byOrigin.delete(oldest);
    },
    versionOf(url) {
      const origin = originOf(url);
      return origin === undefined ? undefined : byOrigin.get(origin);
    },
  };
}
