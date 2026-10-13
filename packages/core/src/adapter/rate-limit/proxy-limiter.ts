import { resolveEndpoint } from "../../utils/execute-resolve";
import type { HandlerConfig } from "../handler-config";
import { errorResponse } from "../parse";
import { readRouting } from "../read-routing";
import { servedSources } from "../served-sources";
import { callerKey } from "./caller-key";
import { memoryRateLimitStore } from "./memory-store";
import { rateLimitHeaders, type TakenBudget } from "./rate-limit-headers";
import type { RateLimitWindow } from "./types";

/** What taking a call from its caller's budgets came to: a refusal, or the headers to answer with. */
export type LimitOutcome = { refused: Response } | { headers: Headers } | undefined;

/** The proxy's limit on each caller, as `rateLimit` sets it. */
export interface ProxyLimiter {
  /**
   * Take a request's call from its caller's budgets.
   *
   * @param request - The request
   * @returns A refusal to answer with, the headers to add to the answer, or `undefined` for a request left out
   */
  take(request: Request): Promise<LimitOutcome>;
}

/**
 * The limit `rateLimit` sets, or none where it sets none: every call takes
 * one from its caller's `requests`, a write one from `writes` first, and a
 * call past either is answered 429 with the time to wait.
 *
 * @param config - The handler's configuration
 * @returns The limiter, or `undefined`
 * @example
 * ```ts
 * const limiter = createProxyLimiter({ rateLimit: { requests: 300, window: 60_000 } });
 * ```
 */
export function createProxyLimiter(config: HandlerConfig | undefined): ProxyLimiter | undefined {
  const limit = config?.rateLimit;
  if (limit === undefined) return undefined;
  const store = limit.store ?? memoryRateLimitStore();
  const keyOf = limit.key ?? callerKey;
  return {
    async take(request) {
      const key = await keyOf(request);
      if (key === undefined) return undefined;
      const budgets: Array<[string, RateLimitWindow]> = [["calls", limit]];
      if (limit.writes !== undefined && isWrite(request, config))
        budgets.unshift(["writes", limit.writes]);
      const taken: TakenBudget[] = [];
      for (const [name, budget] of budgets) {
        const decision = await store.take(`${name}:${key}`, budget);
        taken.push({ name, limit: budget, decision });
        if (!decision.allowed) return { refused: tooMany(taken) };
      }
      return { headers: rateLimitHeaders(taken) };
    },
  };
}

/* A call that is not a read: a stream reads, and an endpoint that does not say it reads writes. */
function isWrite(request: Request, config: HandlerConfig | undefined): boolean {
  const url = new URL(request.url);
  if (url.searchParams.get("_transport") === "sse") return false;
  if (request.headers.get("accept")?.includes("text/event-stream")) return false;
  const routing = readRouting(url);
  if (routing === undefined) return false;
  const dataSource = servedSources(config?.sources)[routing.source];
  if (dataSource === undefined) return false;
  const { schema } = resolveEndpoint(
    dataSource as unknown as Record<string, unknown>,
    routing.group,
    routing.method,
  );
  return schema?.type !== "query";
}

function tooMany(taken: readonly TakenBudget[]): Response {
  const headers = rateLimitHeaders(taken);
  const wait = headers.get("retry-after") ?? "1";
  const response = errorResponse(
    429,
    `Too many calls from this caller; try again in ${wait} s`,
    "RATE_LIMITED",
  );
  headers.forEach((value, name) => {
    response.headers.set(name, value);
  });
  return response;
}
