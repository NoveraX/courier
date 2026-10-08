/** One call of an endpoint, as the template is read from: where it went, and what it was called with. */
export interface CalledPath {
  /** The path's segments after the API's base path, decoded */
  segments: readonly string[];
  variables: unknown;
}

/** An endpoint's route, read from its calls. */
export interface PathTemplate {
  /** OpenAPI's form: `/products/{id}/reviews` */
  path: string;
  /** The parameters in it, in order */
  params: string[];
}

/**
 * An endpoint's route, read from the paths its calls went to: a segment
 * every call shares is written as it is; one that differs, or one that is
 * a variable's value, is a parameter — named after the variable whose value
 * it was in every call, else `param1`, `param2`. Calls with another number
 * of segments than most are passed over.
 *
 * @param calls - Its calls
 * @returns The route, or `undefined` when no call says where it went
 * @example
 * ```ts
 * pathTemplate([{ segments: ["products", "p_1"], variables: { id: "p_1" } }]);
 * // { path: "/products/{id}", params: ["id"] }
 * ```
 */
export function pathTemplate(calls: readonly CalledPath[]): PathTemplate | undefined {
  const length = commonLength(calls);
  if (length === undefined) return undefined;
  const fitting = calls.filter((call) => call.segments.length === length);
  const params: string[] = [];
  const parts: string[] = [];
  for (let at = 0; at < length; at++) {
    const values = fitting.map((call) => call.segments[at] ?? "");
    const named = variableNamed(fitting, at);
    const varies = new Set(values).size > 1;
    if (!varies && named === undefined) {
      parts.push(values[0] ?? "");
      continue;
    }
    const name = uniqueName(named ?? `param${params.length + 1}`, params);
    params.push(name);
    parts.push(`{${name}}`);
  }
  return { path: `/${parts.join("/")}`, params };
}

/* Most calls' number of segments: a call that went elsewhere does not bend the route. */
function commonLength(calls: readonly CalledPath[]): number | undefined {
  const counts = new Map<number, number>();
  for (const call of calls)
    counts.set(call.segments.length, (counts.get(call.segments.length) ?? 0) + 1);
  let best: [number, number] | undefined;
  for (const entry of counts) if (!best || entry[1] > best[1]) best = entry;
  return best?.[0];
}

/* The variable whose value was this segment in every call. */
function variableNamed(calls: readonly CalledPath[], at: number): string | undefined {
  const [first] = calls;
  if (!first || !isRecord(first.variables)) return undefined;
  for (const [key, value] of Object.entries(first.variables)) {
    if (!isScalar(value)) continue;
    const everywhere = calls.every((call) => {
      const own = isRecord(call.variables) ? call.variables[key] : undefined;
      return isScalar(own) && String(own) === call.segments[at];
    });
    if (everywhere) return key;
  }
  return undefined;
}

function uniqueName(name: string, taken: readonly string[]): string {
  let unique = name;
  for (let n = 2; taken.includes(unique); n++) unique = `${name}${n}`;
  return unique;
}

function isScalar(value: unknown): value is string | number | boolean {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
