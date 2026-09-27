import type { Sources } from "../define/types";
import { requireSources } from "./require-sources";

/**
 * The sources a handler answers for: the ones it was created with, or else
 * the process-wide registry, read at request time.
 *
 * @param given - The `sources` the handler's config named, if any
 * @returns The sources to resolve this request against
 * @throws ConfigurationError `SOURCES_NOT_REGISTERED` when neither exists
 *
 * @example
 * ```ts
 * const sources = servedSources(config?.sources);
 * ```
 */
export function servedSources(given: Sources | undefined): Sources {
  return given ?? requireSources();
}
