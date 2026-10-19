/**
 * Path manipulation utilities for OpenAPI/Postman parsers.
 */

import { joinSharedPaths, NO_PATHS, sharedPathOf, sharedPrefix } from "./shared-path";

/** Convert OpenAPI path params `{id}` to Courier-style `:id` */
export function convertPathParams(path: string): string {
  return path.replace(/\{([\w-]+)\}/g, (_, name: string) => `:${pathParamName(name)}`);
}

/**
 * The name a path parameter takes in the path and in the variables.
 *
 * A placeholder is read up to the first character that cannot be part of an
 * identifier, so `:file-id` would name `file`; the hyphen becomes an
 * underscore. The value still fills the same segment, so nothing on the wire
 * changes.
 *
 * @param name - The parameter's name as the specification writes it
 * @returns The name the generated path and variables use
 * @example
 * ```ts
 * pathParamName("file-id"); // → "file_id"
 * ```
 */
export function pathParamName(name: string): string {
  return name.replace(/-/g, "_");
}

/** Extract path from Postman URL (strip protocol, host, query) */
export function extractPostmanPath(url: string): string {
  try {
    const u = new URL(url.replace(/\{\{.*?\}\}/g, "localhost"));
    return u.pathname;
  } catch {
    return url.split("?")[0] ?? url;
  }
}

/**
 * The prefix a group of paths takes: the parent of a lone path, or what
 * several share up to their first parameter — `/` when that is nothing.
 * Each path is read once, however many there are.
 *
 * @param paths - The group's paths, as the specification writes them
 * @returns The prefix, starting with `/`
 * @example
 * ```ts
 * findCommonPrefix(["/pets", "/pets/{id}"]); // → "/pets"
 * findCommonPrefix(["/pets/{id}/toys"]); // → "/pets/{id}"
 * ```
 */
export function findCommonPrefix(paths: readonly string[]): string {
  let shared = NO_PATHS;
  for (const path of paths) shared = joinSharedPaths(shared, sharedPathOf(path));
  return sharedPrefix(shared);
}
