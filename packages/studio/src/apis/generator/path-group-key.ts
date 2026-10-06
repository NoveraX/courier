/**
 * A segment that names a version rather than a resource: `v1`, `v2beta1`,
 * `1.1`, `2`, or a date, as Twilio's `2010-04-01`.
 */
const VERSION =
  /^(?:v\d+(?:[._]\d+)*(?:(?:alpha|beta|rc|preview)\d*)?|\d+(?:\.\d+)*|\d{4}-\d{2}-\d{2})$/i;

/* A path's segments, a query some specifications write into the key cut off. */
function segmentsOf(path: string): string[] {
  return (path.split("?")[0] ?? "").split("/").filter(Boolean);
}

function isParameter(segment: string): boolean {
  return segment.startsWith("{") || segment.startsWith(":");
}

/**
 * How many leading segments every path of a specification shares above
 * every operation, up to the first parameter: Stripe's `/v1`, an API served
 * under `/api`. They name the API itself, so grouping by path looks past
 * them. A segment an operation is declared at is a resource of its own and
 * never part of them: an API whose every path starts with `/settings`, one
 * of them `/settings` itself, groups them all under `settings`.
 *
 * @param paths - Every path of the specification, as it writes them
 * @returns The number of segments they share
 * @example
 * ```ts
 * sharedRoot(["/v1/customers", "/v1/charges/{charge}"]); // 1
 * sharedRoot(["/settings", "/settings/list"]); // 0
 * ```
 */
export function sharedRoot(paths: readonly string[]): number {
  const all = paths.map(segmentsOf);
  const [first = [], ...rest] = all;
  const above = Math.min(...all.map((segments) => segments.length)) - 1;
  let depth = 0;
  for (const segment of first) {
    if (depth >= above || isParameter(segment)) break;
    if (!rest.every((other) => other[depth] === segment)) break;
    depth += 1;
  }
  return depth;
}

/**
 * The segment a path is grouped by: the first after the segments every
 * path shares that names neither a parameter nor a version. A path with no
 * such segment — the API's root, `/`, or `/v1` alone — is in no group.
 *
 * @param path - The path, as the specification writes it
 * @param root - How many leading segments every path shares
 * @returns The segment, or `null` for a path in no group
 * @example
 * ```ts
 * pathGroupKey("/v1/customers/{customer}", 1); // "customers"
 * pathGroupKey("/{owner}/v2/repos", 0); // "repos"
 * pathGroupKey("/", 0); // null
 * ```
 */
export function pathGroupKey(path: string, root: number): string | null {
  for (const segment of segmentsOf(path).slice(root)) {
    if (!isParameter(segment) && !VERSION.test(segment)) return segment;
  }
  return null;
}
