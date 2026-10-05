/**
 * Where a stream another server serves is opened, as its source's
 * definition says — by a direct caller, and by a proxy relaying it.
 */

import { buildDirectSSEUrl } from "../../realtime/sse-address";
import { layerHeaders } from "../../utils/layer-headers";
import { addressCall } from "./address";
import { placedEndpoint } from "./placed-endpoint";
import { fieldOf, textOf } from "./read-definition";

/** A stream's request: its URL, and the headers its source sends every call with */
export interface StreamRequest {
  /** The source's base, its groups' prefixes, then the address the endpoint declares */
  readonly url: string;
  /** What the source declares in `headers` — an API key, an `Authorization` */
  readonly sourceHeaders: Record<string, string>;
}

/**
 * The request that opens a stream another server serves.
 *
 * It carries the source's `headers`, as every HTTP call does, so a stream of
 * an API that takes a key there is not refused with 401.
 *
 * @param api - The source
 * @param group - The stream's group's path, empty for none
 * @param method - The stream's name
 * @param variables - What it is called with; those its path does not take go in the query
 * @returns The request
 * @throws RealtimeValidationError when a path parameter is missing or would change the route
 * @example
 * ```ts
 * streamRequest(api, "orders", "watch", { id: "o1", since: "2026" });
 * // → { url: "https://api.example.com/orders/o1/events?since=2026", sourceHeaders: { authorization: "Bearer …" } }
 * ```
 */
export function streamRequest(
  api: object,
  group: string,
  method: string,
  variables: unknown,
): StreamRequest {
  const options = fieldOf(api, "options");
  const { definition, prefix } = placedEndpoint(api, group, method);
  const address = addressCall(definition, method, variables);
  return {
    url: buildDirectSSEUrl(textOf(options, "baseURL"), prefix, address.path, address.variables),
    sourceHeaders: layerHeaders(fieldOf(options, "headers")),
  };
}
