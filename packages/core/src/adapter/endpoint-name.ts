/**
 * An endpoint as a refusal and a log line name it: `[api][live][room]`, the
 * group left empty for an endpoint outside any group — the name alone,
 * never the variables a subscription or a call was made with.
 *
 * @param endpoint - Where the endpoint is
 * @returns Its name
 * @example
 * ```ts
 * endpointName({ source: "api", group: "live", method: "room" }); // "[api][live][room]"
 * endpointName({ source: "api", method: "feed" }); // "[api][][feed]"
 * ```
 */
export function endpointName(endpoint: {
  source?: string | undefined;
  group?: string | undefined;
  method: string;
}): string {
  return `[${endpoint.source ?? ""}][${endpoint.group ?? ""}][${endpoint.method}]`;
}
