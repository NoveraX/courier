/**
 * The groups and endpoints a client can reach, read from its source.
 */

/** What a source says a client may call. */
export interface ClientShape {
  /** Each group, with the names of its methods. */
  groups: ReadonlyMap<string, ReadonlySet<string>>;
  /** Endpoints called at the root, without a group. */
  endpoints: ReadonlySet<string>;
}

/**
 * Read the shape of a `defineApi` result, or of the source a boundary stands for.
 *
 * @param source - The source, when the client was given one
 * @returns The shape, or `undefined` when the client knows only a name
 *
 * @example
 * ```ts
 * shapeOfSource(api)?.groups.get("users"); // → Set { "list", "getById" }
 * ```
 */
export function shapeOfSource(
  source: Record<string, unknown> | undefined,
): ClientShape | undefined {
  if (!source) return undefined;
  const groupRecord =
    (source.options as { groups?: Record<string, Record<string, unknown>> } | undefined)?.groups ??
    {};

  const groups = new Map<string, ReadonlySet<string>>();
  for (const [name, group] of Object.entries(groupRecord)) {
    groups.set(name, new Set(endpointNames(group)));
  }
  return { groups, endpoints: new Set(endpointNames(source)) };
}

function endpointNames(record: Record<string, unknown>): string[] {
  return Object.keys(record).filter(
    (key) => key !== "options" && typeof record[key] === "object" && record[key] !== null,
  );
}
