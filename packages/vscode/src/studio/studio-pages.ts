/**
 * The endpoint's page in Studio: the Explorer, with the endpoint open.
 *
 * @param studio - Studio's address
 * @param source - The endpoint's source
 * @param endpoint - Its call in the client
 * @returns The address
 * @example
 * ```ts
 * endpointPage("http://localhost:6280", "shop", "orders.place"); // ".../explorer/endpoints?endpoint=shop.orders.place"
 * ```
 */
export function endpointPage(studio: string, source: string, endpoint: string): string {
  const page = new URL("/explorer/endpoints", studio);
  page.searchParams.set("endpoint", `${source}.${endpoint}`);
  return page.toString();
}

/**
 * One request open in Studio's inspector, over its Timeline.
 *
 * @param studio - Studio's address
 * @param request - The request's id, as Studio keeps it
 * @returns The address
 * @example
 * ```ts
 * requestPage("http://localhost:6280", "req_mv3tn4bk_1l"); // ".../timeline?req=req_mv3tn4bk_1l"
 * ```
 */
export function requestPage(studio: string, request: string): string {
  const page = new URL("/timeline", studio);
  page.searchParams.set("req", request);
  return page.toString();
}

/**
 * The Timeline showing one endpoint's failed calls.
 *
 * @param studio - Studio's address
 * @param source - The endpoint's source
 * @param endpoint - Its call in the client
 * @returns The address
 * @example
 * ```ts
 * failuresPage("http://localhost:6280", "shop", "orders.place"); // ".../timeline?view=errors&source=shop&q=orders.place"
 * ```
 */
export function failuresPage(studio: string, source: string, endpoint: string): string {
  const page = new URL("/timeline", studio);
  page.searchParams.set("view", "errors");
  page.searchParams.set("source", source);
  page.searchParams.set("q", endpoint);
  return page.toString();
}

/**
 * Studio's Audit page, where a finding reads in full with its suggested fix.
 *
 * @param studio - Studio's address
 * @returns The address
 * @example
 * ```ts
 * auditPage("http://localhost:6280"); // "http://localhost:6280/audit"
 * ```
 */
export function auditPage(studio: string): string {
  return new URL("/audit", studio).toString();
}
