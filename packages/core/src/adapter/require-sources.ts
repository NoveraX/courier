import type { Sources } from "../define/types";
import { ConfigurationError } from "../errors";
import { getSources } from "../sources";

/**
 * Read the global sources registry or throw a clear initialization
 * error. Called per request by adapter execute closures and by the
 * SSE/WS handlers at request time — never at factory-mount time — so
 * a valid call sequence (`attachRuntime()` awaited before the first
 * request) always succeeds.
 */
export function requireSources(): Sources {
  const sources = getSources();
  if (!sources) {
    throw new ConfigurationError(
      "SOURCES_NOT_REGISTERED",
      [
        "[courier] No API sources are registered.",
        "",
        "Call `await attachRuntime()` from `@noverax/courier-studio-core/runtime`",
        "in your server instrumentation BEFORE mounting adapter handlers.",
        "`attachRuntime()` auto-loads `courier.config.ts` and populates the",
        "global sources registry that adapter handlers read at request time.",
      ].join("\n"),
    );
  }
  return sources;
}
