/**
 * An endpoint as its topic and its errors name it: `source.group.method`, or
 * `source.method` for one outside any group.
 *
 * @param endpoint - Where the endpoint is
 * @returns Its name
 * @example
 * ```ts
 * streamLabel({ source: "api", group: "chat", method: "feed" }); // "api.chat.feed"
 * ```
 */
export function streamLabel(endpoint: {
  source: string;
  group?: string | undefined;
  method: string;
}): string {
  return `${endpoint.source}.${endpoint.group ? `${endpoint.group}.` : ""}${endpoint.method}`;
}
