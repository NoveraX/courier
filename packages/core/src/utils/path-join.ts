const MULTIPLE_SLASHES = /\/+/g;
const LEADING_SLASH = /^\//;

/**
 * Join a path's parts with one slash between them and none before them.
 *
 * @param parts - The parts, each with or without slashes of its own
 * @returns The path
 * @example
 * ```ts
 * pathJoin(["/api", "users/", "/list"]); // → "api/users/list"
 * ```
 */
export function pathJoin(parts: string[]): string {
  return parts.join("/").replace(MULTIPLE_SLASHES, "/").replace(LEADING_SLASH, "");
}
