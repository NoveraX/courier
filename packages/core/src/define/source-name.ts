/**
 * A source's name, as a call, a server and a tool read it off the source
 * `defineApi` made, and as a registry stamps its own over it. `defineApi`
 * writes the name itself: a page of definitions alone loads none of this.
 */

import { SOURCE_NAME_KEY } from "./source-name-key";
import type { AnyDefinedApi } from "./types";

/**
 * The name a source carries: the one `defineApi` gave it, or one a
 * registry stamped over it.
 *
 * @param source - The source, or any value
 * @returns Its name, or `undefined` for a value that carries none
 * @example
 * ```ts
 * getSourceName(defineApi({ name: "shop", endpoints: {} })); // → "shop"
 * ```
 */
export function getSourceName(source: unknown): string | undefined {
  if (!source || typeof source !== "object") return undefined;
  return (source as Record<symbol, unknown>)[SOURCE_NAME_KEY] as string | undefined;
}

/**
 * Whether a value is an API `defineApi` made — what a registry hands back
 * typed only as a source: every one carries the name it is registered or
 * defined under.
 *
 * @param value - The value to check
 * @returns `true` for a defined API
 * @example
 * ```ts
 * const source = getSources()?.[name];
 * if (isDefinedApi(source)) openStreams(source);
 * ```
 */
export function isDefinedApi(value: unknown): value is AnyDefinedApi {
  return getSourceName(value) !== undefined;
}

/**
 * Forcibly stamp `name` onto `source` as its canonical source name.
 *
 * Use when an explicit identifier (e.g. a `courier.config.ts` `sources` key)
 * must override the value derived inside `defineApi`. The internal symbol
 * stays private — call this helper instead of touching it directly.
 *
 * @param source - The source
 * @param name - The name it is registered under
 * @example
 * ```ts
 * setSourceName(sources.payments, "payments");
 * ```
 */
export function setSourceName(source: unknown, name: string): void {
  if (!source || typeof source !== "object") return;
  (source as Record<symbol, unknown>)[SOURCE_NAME_KEY] = name;
}
