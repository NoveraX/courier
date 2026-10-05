/**
 * The method an endpoint or a call is listed under: its HTTP method, or
 * `WS` or `SSE` for a stream.
 *
 * @param target - Its transport and HTTP method
 * @returns The label
 * @example
 * ```ts
 * methodLabelOf({ transport: "sse", httpMethod: "GET" }); // "SSE"
 * ```
 */
export function methodLabelOf(target: {
  transport: "http" | "sse" | "ws";
  httpMethod: string;
}): string {
  if (target.transport === "ws") return "WS";
  return target.transport === "sse" ? "SSE" : target.httpMethod;
}
