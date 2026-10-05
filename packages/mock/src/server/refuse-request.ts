import { randomUUID } from "node:crypto";
import type { Context as HonoContext } from "hono";

import { pushHistory } from "./route-response";
import type { RouteConfig } from "./route-types";

/**
 * Refuse a request whose body the mock could not read — larger than its
 * limit, a form that does not parse, a client that stopped sending — with
 * the status and the reason, kept in the history and told to the request
 * hooks as any request is, so Studio's log shows it refused and why.
 *
 * @param c - The request's context
 * @param group - The endpoint's group
 * @param method - The endpoint's name
 * @param refusal - The status and the reason
 * @param config - The route config, for its history and hooks
 * @returns The answer: `{ error }` with the status
 * @example
 * ```ts
 * if ("error" in body) return refuseRequest(c, group, method, body, config);
 * ```
 */
export function refuseRequest(
  c: HonoContext,
  group: string,
  method: string,
  { error, status }: { error: string; status: 400 | 413 },
  config: Pick<RouteConfig, "history" | "hooks">,
): Response {
  const requestId = `req_${randomUUID()}`;
  const path = new URL(c.req.url).pathname;
  const headers = Object.fromEntries(c.req.raw.headers);
  config.hooks?.onStart?.(requestId, c.req.method, path, group, method, undefined, headers);
  pushHistory(config, {
    group,
    method,
    variables: undefined,
    start: performance.now(),
    status,
    error,
  });
  config.hooks?.onError?.(requestId, status, error, 0);
  return c.json({ error }, status);
}
