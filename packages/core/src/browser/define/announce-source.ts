/**
 * A page's stand-in for telling Studio an API was defined: a page runs no
 * Studio, so there is no one to tell.
 *
 * @param _api - The API just defined
 * @param _baseURL - Its address
 * @example
 * ```ts
 * announceSource(api, "https://api.example.com");
 * ```
 */
export function announceSource(_api: unknown, _baseURL: string): void {
  /* A page runs no Studio to tell. */
}
