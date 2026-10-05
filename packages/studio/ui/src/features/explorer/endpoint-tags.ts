import type { EndpointNode } from "./explorer-model";

/** What a tag on an endpoint says, and the colour it says it in. */
export interface EndpointTag {
  label: string;
  tone: "stream" | "mutation" | "query" | "proxy" | "warn";
}

/**
 * The tags the Endpoints tab gives an endpoint: its kind — `sse` or
 * `websocket`, else `query` or `mutation` — then `proxy` when its calls
 * went through Courier's proxy and `untyped response` when it declares no
 * response schema.
 *
 * @param e - The endpoint
 * @returns Its tags, in that order
 * @example
 * ```ts
 * endpointTags(endpoint).map((t) => t.label); // ["mutation", "proxy"]
 * ```
 */
export function endpointTags(e: EndpointNode): EndpointTag[] {
  const kind: EndpointTag =
    e.transport === "http"
      ? { label: e.type ?? "query", tone: e.type === "mutation" ? "mutation" : "query" }
      : { label: e.transport === "ws" ? "websocket" : "sse", tone: "stream" };
  const tags = [kind];
  if (e.proxied) tags.push({ label: "proxy", tone: "proxy" });
  if (!e.hasResponseSchema) tags.push({ label: "untyped response", tone: "warn" });
  return tags;
}
