import type { Context as HonoContext } from "hono";

import { dropConnection } from "./fault-response";
import { proxyFailure } from "./proxy-failure";
import type { BodyRefusal } from "./read-request-body";
import { callOf } from "./request-call";
import { requestTarget } from "./request-target";
import { pushHistory } from "./route-response";
import type { RouteConfig } from "./route-types";

/**
 * Refuse a request whose body the mock did not take — larger than its
 * limit, a file of a type it does not take, a form that does not parse, a
 * client that stopped sending — with the status and the reason, kept in
 * the history and told to the request hooks as any request is, under the
 * id its upload was reported under, so Studio's log shows it refused and
 * why. One the `interrupt` fault cut off has its connection dropped: it
 * counts as a failure for the stop conditions, as any injected fault does.
 *
 * @param c - The request's context
 * @param group - The endpoint's group
 * @param method - The endpoint's name
 * @param refusal - The status and the reason, and whether the connection was cut
 * @param config - The route config, for its history, hooks and network state
 * @param answeredAs - Whose answer the refusal is: the mock's own, or the proxy's it stands in for
 * @returns The answer — `{ error }`, or the proxy's `{ success: false, message }` — with the status, or none for a dropped connection
 * @example
 * ```ts
 * if ("error" in body) return refuseRequest(c, group, method, body, config);
 * ```
 */
export function refuseRequest(
  c: HonoContext,
  group: string,
  method: string,
  { error, status, dropped }: BodyRefusal,
  config: Pick<RouteConfig, "history" | "hooks" | "networkState">,
  answeredAs: "mock" | "proxy" = "mock",
): Response {
  const { id, start } = callOf(c.req.raw);
  const path = requestTarget(c.req.url);
  const headers = Object.fromEntries(c.req.raw.headers);
  config.hooks?.onStart?.(id, c.req.method, path, group, method, undefined, headers);
  pushHistory(config, { group, method, variables: undefined, start, status, error });
  const duration = performance.now() - start;
  config.hooks?.onError?.(id, status, error, duration);
  if (!dropped) return c.json(answeredAs === "proxy" ? proxyFailure(error) : { error }, status);
  config.networkState?.trackRequest(duration, true);
  return dropConnection(c, error);
}
