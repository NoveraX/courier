/** Where a recorded call went: its URL, and the origin of the page or app that made it when known. */
export interface CallAddress {
  readonly url: URL;
  readonly origin: string | undefined;
}

/* What a path is read against when no origin is known: only its path and query are kept. */
const NO_ORIGIN = "http://localhost";

/* A URL that names its scheme, as an absolute one does. */
const SCHEME = /^[A-Za-z][A-Za-z0-9+.-]*:/;

/**
 * Read where a recorded call went. A browser runtime whose source has a
 * relative base URL records a path, `/api/pets`, which is read against the
 * origin of the page that made it — or, with no origin known, for its
 * path and query alone. An absolute http(s) URL is read as it is, and one
 * that starts with `//` only against an origin. Anything else is no
 * address, and it never throws.
 *
 * @param url - The URL the call recorded
 * @param origin - The origin of the page that made it, when known
 * @returns The address, or `null` for a call with none Studio can read
 * @example
 * ```ts
 * addressOf("/api/pets?page=2", "https://app.example")?.url.href; // → "https://app.example/api/pets?page=2"
 * ```
 */
export function addressOf(url: string | undefined, origin: string | undefined): CallAddress | null {
  if (url === undefined) return null;
  if (SCHEME.test(url)) return absolute(url);
  if (url.startsWith("//")) return origin === undefined ? null : relative(url, origin, true);
  if (url.startsWith("/")) return relative(url, origin ?? NO_ORIGIN, origin !== undefined);
  return null;
}

function absolute(url: string): CallAddress | null {
  if (!URL.canParse(url)) return null;
  const parsed = new URL(url);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
  return { url: parsed, origin: parsed.origin };
}

function relative(url: string, base: string, known: boolean): CallAddress | null {
  if (!URL.canParse(url, base)) return null;
  const parsed = new URL(url, base);
  return { url: parsed, origin: known ? parsed.origin : undefined };
}
