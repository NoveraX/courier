import { withoutEdgeSlashes } from "@noverax/courier/internal";

/**
 * An endpoint's path joined from its group's prefix and its own path, with
 * one slash between the parts and one in front.
 *
 * @param prefix - The group's prefix
 * @param path - The endpoint's own path
 * @returns The joined path
 * @example
 * ```ts
 * joinPath("/orders/", "/:id"); // "/orders/:id"
 * ```
 */
export function joinPath(prefix: string, path: string): string {
  const joined = [prefix, path].map(withoutEdgeSlashes).filter(Boolean).join("/");
  return `/${joined}`;
}
