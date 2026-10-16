import type { StudioHooks } from "../../studio/hooks";
import { studioRequestIdOf } from "../../studio/studio-request-id";
import { discardBody } from "../discard-body";
import { announceProxyCall } from "../proxy-call-events";
import { readRouting } from "../read-routing";
import { admittedOnStudioPass } from "../studio-pass-gate";
import type { ProxyLimiter } from "./proxy-limiter";

type Serve = (request: Request) => Promise<Response>;

/**
 * Put the proxy's limit on each caller in front of an entry point: a call
 * past its caller's budget is answered 429 before its body is read, and
 * Studio shows it refused; every other answer tells its caller what is
 * left of the budget.
 *
 * @param serve - The entry point
 * @param limiter - The limit, or `undefined` where `rateLimit` sets none
 * @param dt - Studio's hooks
 * @returns The entry point, limited
 * @example
 * ```ts
 * const handlePost = gateEntry(limitEntry(post, limiter, studioHooks), config);
 * ```
 */
export function limitEntry(
  serve: Serve,
  limiter: ProxyLimiter | undefined,
  dt: StudioHooks,
): Serve {
  if (limiter === undefined) return serve;
  return async (request) => {
    const outcome = await limiter.take(request);
    if (outcome === undefined) return serve(request);
    if ("refused" in outcome) {
      discardBody(request);
      tellStudio(request, outcome.refused, dt);
      return outcome.refused;
    }
    return withHeaders(await serve(request), outcome.headers);
  };
}

function tellStudio(request: Request, refused: Response, dt: StudioHooks): void {
  const routing = readRouting(new URL(request.url));
  if (routing === undefined || (request.method !== "GET" && request.method !== "POST")) return;
  const call = announceProxyCall(
    dt,
    request.method,
    routing,
    studioRequestIdOf(request.headers),
    admittedOnStudioPass(request),
  );
  call.refused(refused.status, "Past the caller's rate limit");
}

function withHeaders(response: Response, added: Headers): Response {
  const headers = new Headers(response.headers);
  added.forEach((value, name) => {
    headers.set(name, value);
  });
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
