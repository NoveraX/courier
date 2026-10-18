import type { SharedAnswer } from "./request";

/**
 * How a call's read was answered by another call's request, in the shape
 * the runtime gives it, wherever it comes from: a runtime's event, a page,
 * a saved session or a session file. Anything else is no mark.
 *
 * @param value - What is held under `shared`
 * @returns How it was shared, or `undefined` for a call that sent its own request
 * @example
 * ```ts
 * readShared({ by: "flight", with: "req_1" }); // → { by: "flight", with: "req_1" }
 * readShared({ by: "cache" }); // → undefined
 * ```
 */
export function readShared(value: unknown): SharedAnswer | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const by: unknown = Reflect.get(value, "by");
  if (by !== "flight" && by !== "render") return undefined;
  const answered: unknown = Reflect.get(value, "with");
  return { by, ...(typeof answered === "string" && { with: answered }) };
}
