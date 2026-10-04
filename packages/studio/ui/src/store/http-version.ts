import type { HttpVersion } from "./types-request";

const HTTP_VERSIONS = [
  "HTTP/1.0",
  "HTTP/1.1",
  "HTTP/2",
  "HTTP/3",
] as const satisfies readonly HttpVersion[];

function isHttpVersion(value: unknown): value is HttpVersion {
  return HTTP_VERSIONS.some((version) => version === value);
}

/**
 * The HTTP version a runtime or a saved session names, when it is one.
 *
 * @param value - What it named
 * @returns The version, or `undefined` for anything else
 * @example
 * ```ts
 * httpVersionOf(event.httpVersion); // → "HTTP/2"
 * ```
 */
export function httpVersionOf(value: unknown): HttpVersion | undefined {
  return isHttpVersion(value) ? value : undefined;
}
