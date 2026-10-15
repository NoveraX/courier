import type { SavedRequest } from "./session-types";

/**
 * How a call's read was answered by another call's request, kept only when
 * the page says it in the shape Studio gave it.
 *
 * @param value - What the page holds under `shared`
 * @returns How it was shared, or `undefined` for a call that sent its own request
 * @example
 * ```ts
 * sharedOf({ by: "render", with: "req_1" }); // { by: "render", with: "req_1" }
 * ```
 */
export function sharedOf(value: unknown): SavedRequest["shared"] {
  if (typeof value !== "object" || value === null) return undefined;
  const by: unknown = Reflect.get(value, "by");
  const answered: unknown = Reflect.get(value, "with");
  if (by !== "flight" && by !== "render") return undefined;
  return { by, ...(typeof answered === "string" && { with: answered }) };
}
