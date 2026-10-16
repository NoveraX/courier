import { NEXT_ORIGIN_ENV, type ServerOrigin } from "@noverax/courier/internal";

/**
 * Where a Next.js server listens. Next records it as its server starts —
 * the address it listens on, `https` only with its own certificate — and no
 * request changes it. Where a Next version records none, the URL Next gives
 * the request stands in: its name and port are Next's own, but its scheme
 * follows the `X-Forwarded-Proto` any client sends, and under
 * `experimental.trustHostHeader` its name is the request's `Host`.
 *
 * @param request - The request as Next hands it to the route
 * @returns The server's own origin
 * @example
 * ```ts
 * announce(ownOrigin(request)); // → { serverOrigin: "http://localhost:3000" }
 * ```
 */
export function ownOrigin(request: Request): ServerOrigin {
  return { serverOrigin: recordedOrigin() ?? new URL(request.url).origin };
}

/* Edge routes run where `process` may be missing, or its env empty. */
function recordedOrigin(): string | undefined {
  const recorded = typeof process === "undefined" ? undefined : process.env?.[NEXT_ORIGIN_ENV];
  return recorded ? recorded : undefined;
}
