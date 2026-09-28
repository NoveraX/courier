import type { RequestEntry } from "@/store/types";

/**
 * The dotted name a Timeline row shows for a request: its source, its
 * group when it has one, and its endpoint.
 *
 * @param r - The request
 * @returns The name, e.g. `api.users.create`
 *
 * @example
 * ```ts
 * requestName({ source: "api", group: undefined, method: "health" }); // "api.health"
 * ```
 */
export function requestName(r: Pick<RequestEntry, "source" | "group" | "method">): string {
  const parts: string[] = [];
  if (r.source) parts.push(r.source);
  if (r.group) parts.push(r.group);
  parts.push(r.method);
  return parts.join(".");
}
