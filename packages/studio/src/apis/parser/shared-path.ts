/**
 * The path a set of paths shares, gathered one path or one whole set at a
 * time: the paths under a tag and under every tag inside it are each read
 * once, however deep the tags nest.
 */

/** Paths gathered so far: how many, and the segments every one of them begins with. */
export interface SharedPath {
  readonly count: number;
  readonly segments: readonly string[];
}

/** No path gathered yet. */
export const NO_PATHS: SharedPath = { count: 0, segments: [] };

/**
 * One path, as a set of its own.
 *
 * @param path - A path, as the specification writes it
 * @returns The set holding only that path
 * @example
 * ```ts
 * sharedPathOf("/pets/{id}"); // → { count: 1, segments: ["pets", "{id}"] }
 * ```
 */
export function sharedPathOf(path: string): SharedPath {
  return { count: 1, segments: path.split("/").filter(Boolean) };
}

/**
 * Paths, gathered into one set.
 *
 * @param paths - Paths, as the specification writes them
 * @returns The set holding them all
 * @example
 * ```ts
 * gatheredPaths(["/pets", "/pets/{id}"]); // → { count: 2, segments: ["pets"] }
 * ```
 */
export function gatheredPaths(paths: readonly string[]): SharedPath {
  let shared = NO_PATHS;
  for (const path of paths) shared = joinSharedPaths(shared, sharedPathOf(path));
  return shared;
}

/**
 * Two sets of paths, gathered into one.
 *
 * @param a - Paths gathered so far
 * @param b - More paths
 * @returns Every path of both, and the segments all of them begin with
 * @example
 * ```ts
 * joinSharedPaths(sharedPathOf("/pets/{id}"), sharedPathOf("/pets/mine"));
 * // → { count: 2, segments: ["pets"] }
 * ```
 */
export function joinSharedPaths(a: SharedPath, b: SharedPath): SharedPath {
  if (b.count === 0) return a;
  if (a.count === 0) return b;
  let length = 0;
  while (length < a.segments.length && a.segments[length] === b.segments[length]) length += 1;
  const segments = length === a.segments.length ? a.segments : a.segments.slice(0, length);
  return { count: a.count + b.count, segments };
}

/**
 * The prefix a group of these paths takes: the parent of a lone path, or
 * what several share up to their first parameter — `/` when that is nothing.
 *
 * @param shared - The group's paths
 * @returns The prefix, starting with `/`
 * @example
 * ```ts
 * sharedPrefix(sharedPathOf("/pets/{id}")); // → "/pets"
 * sharedPrefix(joinSharedPaths(sharedPathOf("/{owner}/a"), sharedPathOf("/{owner}/b"))); // → "/"
 * ```
 */
export function sharedPrefix({ count, segments }: SharedPath): string {
  if (count === 1) return segments.length <= 1 ? "/" : `/${segments.slice(0, -1).join("/")}`;
  const end = segments.findIndex((segment) => segment.startsWith("{") || segment.startsWith(":"));
  const common = end === -1 ? segments : segments.slice(0, end);
  return common.length > 0 ? `/${common.join("/")}` : "/";
}
