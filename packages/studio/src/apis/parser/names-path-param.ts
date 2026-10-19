/**
 * Whether a specification's path names a parameter: OpenAPI's `{id}`, or a
 * segment Postman starts with a colon. A colon inside a segment is text, as
 * Google's `index:inspect` writes one.
 *
 * @param path - The path, as the specification writes it
 * @returns Whether a call to it needs a parameter
 * @example
 * ```ts
 * namesPathParam("/v1/projects:search"); // → false
 * namesPathParam("/users/:id"); // → true
 * ```
 */
export function namesPathParam(path: string): boolean {
  return path.includes("{") || path.split("/").some((segment) => segment.startsWith(":"));
}
