import type { ConfigSourceNamer } from "./catalog/config-source-names";

/**
 * The event with its `source` named by the config key, when it names a call.
 *
 * A runtime reports the name its own copy of the definition carries, which
 * outside the registry is only derived from the baseURL host; the UI groups
 * traffic by the name the config gives the source.
 *
 * @param event - A runtime event
 * @param nameSource - Names the config source a call was made against
 * @returns The event, or a copy whose `source` is the config key
 * @example
 * ```ts
 * attributeEvent({ type: "request:start", source: "localhost", method: "list" }, nameSource);
 * // → { type: "request:start", source: "api", method: "list" }
 * ```
 */
export function attributeEvent(
  event: Record<string, unknown>,
  nameSource: ConfigSourceNamer | undefined,
): Record<string, unknown> {
  const { source, group, method } = event;
  if (!nameSource || typeof source !== "string" || typeof method !== "string") return event;
  const named = nameSource({
    source,
    group: typeof group === "string" ? group : undefined,
    method,
  });
  return named === source ? event : { ...event, source: named };
}
