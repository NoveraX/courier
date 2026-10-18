/**
 * Whether a request a test's stubbed `fetch` was given is for the upstream
 * itself, told by its whole origin rather than a prefix, which
 * `https://upstream.example.evil` would share too. The proxy's own route is
 * the app's, named by a relative path, and resolves to the app's origin.
 *
 * @param input - What the stubbed `fetch` was given
 * @param upstream - The upstream's origin, `https://upstream.example`
 * @returns Whether the request goes to the upstream
 * @example
 * ```ts
 * isUpstream("https://upstream.example/search?q=a", UPSTREAM); // true
 * isUpstream("/api/request?_s=api", UPSTREAM); // false
 * ```
 */
export function isUpstream(input: RequestInfo | URL, upstream: string): boolean {
  const url = input instanceof Request ? input.url : String(input);
  return new URL(url, "http://app.localhost").origin === upstream;
}
