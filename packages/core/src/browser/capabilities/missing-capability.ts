/**
 * Why a call that needs a server's part finds none, as a page's bundle has
 * it: the code was built for a page, which reads none.
 *
 * @returns The cause, as a refusal words it
 * @example
 * ```ts
 * missingCapabilityCause(); // → "this code was built for a page, …"
 * ```
 */
export function missingCapabilityCause(): string | undefined {
  return "this code was built for a page, which serves no request: it took Courier's modules for the browser, as a page's build does and as a test environment with the browser condition does, Jest's jsdom among them. Build server code for its server, and test it in a node environment";
}
