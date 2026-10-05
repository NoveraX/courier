/**
 * The path a request was sent to, its query string included: what a mock's
 * log shows and Studio copies as cURL, so a request is sent again as it came.
 *
 * @param url - The request's URL
 * @returns The path and query, `/users?page=2`
 * @example
 * ```ts
 * requestTarget("http://127.0.0.1:7001/users?page=2"); // → "/users?page=2"
 * ```
 */
export function requestTarget(url: string): string {
  const { pathname, search } = new URL(url);
  return pathname + search;
}
