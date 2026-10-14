import { agentMarkTitle } from "./agent-mark-title";
import type { EndpointNode } from "./explorer-model";
import { pageMarkTitle } from "./page-mark-title";

/** What a tag on an endpoint says, the colour it says it in, and what it says on hover. */
export interface EndpointTag {
  label: string;
  tone: "stream" | "mutation" | "query" | "agent" | "proxy" | "warn";
  title?: string;
}

/**
 * The tags the Endpoints tab gives an endpoint: its kind — `sse` or
 * `websocket`, else `query` or `mutation` — then `exposed` when a page may
 * call it through the proxy, `agent` when the project offers it to agents,
 * `proxy` when its calls went through Courier's proxy and `untyped
 * response` when it declares no response schema.
 *
 * @param e - The endpoint
 * @returns Its tags, in that order
 * @example
 * ```ts
 * endpointTags(endpoint).map((t) => t.label); // ["mutation", "exposed", "agent", "proxy"]
 * ```
 */
export function endpointTags(e: EndpointNode): EndpointTag[] {
  const kind: EndpointTag =
    e.transport === "http"
      ? { label: e.type ?? "query", tone: e.type === "mutation" ? "mutation" : "query" }
      : { label: e.transport === "ws" ? "websocket" : "sse", tone: "stream" };
  const tags = [kind];
  if (e.page?.exposed) tags.push({ label: "exposed", tone: "proxy", title: pageMarkTitle(e.page) });
  if (e.agent?.offered)
    tags.push({ label: "agent", tone: "agent", title: agentMarkTitle(e.agent) });
  if (e.proxied) tags.push({ label: "proxy", tone: "proxy" });
  if (!e.hasResponseSchema) tags.push({ label: "untyped response", tone: "warn" });
  return tags;
}
