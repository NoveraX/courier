import { HTTPError } from "../errors";
import { createLogger } from "../logger";
import { defineMiddleware } from "./define";
import type { Middleware } from "./types";

const defaultLogger = createLogger("Middleware");

/** One failed request as the default logger reports it. */
interface Failure {
  outcome: string;
  level: "info" | "warn";
  cause?: unknown;
}

/* An HTTPError carries the upstream's answer — its headers, cookies
   included, and its body — so the default log states its status and never
   prints the error itself; a request with no answer keeps the network
   error behind it. */
function describeFailure(error: unknown): Failure {
  if (error instanceof HTTPError && error.status > 0) {
    return { outcome: String(error.status), level: error.status >= 500 ? "warn" : "info" };
  }
  const cause = error instanceof HTTPError ? error.cause : error;
  return { outcome: "ERROR", level: "warn", ...(cause === undefined ? {} : { cause }) };
}

/**
 * Logging middleware — logs endpoint, status, and duration.
 *
 * Each request is one line, `source:group:method → status (duration)`. A
 * request that got no answer, or failed inside the server, reads
 * `→ ERROR (duration)`. By default the lines go to Courier's logger: an
 * answer at info, a 5xx or a failure at warn — a failure with the error
 * behind it and its stack. The upstream's headers and body are never
 * written. A custom `logger` receives each line, and for a failed request
 * the error it failed with, which for an HTTPError includes the upstream's
 * headers and body.
 *
 * @param options - `logger` receives each line, and the error when the request failed
 * @returns The middleware
 *
 * @example
 * defineApi({
 *   middleware: [logMiddleware()],
 *   groups: { ... },
 * })
 */
export function logMiddleware(options?: {
  /** Receives each line, and the error of a failed request (default: Courier's logger) */
  logger?: ((message: string, error?: unknown) => void) | undefined;
}): Middleware {
  const custom = options?.logger;

  return defineMiddleware("log", "wrap", async (ctx, next) => {
    const label = [ctx.source, ctx.group, ctx.method].filter(Boolean).join(":");
    const start = performance.now();
    const elapsed = () => `(${Math.round(performance.now() - start)}ms)`;

    try {
      const response = await next();
      const line = `${label} → ${response.status} ${elapsed()}`;
      if (custom) custom(line);
      else defaultLogger.info(line);
      return response;
    } catch (error) {
      const failure = describeFailure(error);
      if (custom) custom(`${label} → ${failure.outcome} ${elapsed()}`, error);
      else
        defaultLogger[failure.level](`${label} → ${failure.outcome} ${elapsed()}`, failure.cause);
      throw error;
    }
  });
}
