import { isPlainObject } from "@/socket/is-plain-object";
import type { SharedAnswer } from "./types";

function isSharedBy(value: unknown): value is SharedAnswer["by"] {
  return value === "flight" || value === "render";
}

/**
 * How a call's read was answered by another call's request, from an event
 * or a saved session — kept only when it is in the shape the runtime gives
 * it.
 *
 * @param value - What the payload holds under `shared`
 * @returns How it was shared, or `undefined` for a call that sent its own request
 * @example
 * ```ts
 * readShared({ by: "flight", with: "req_1" }); // { by: "flight", with: "req_1" }
 * ```
 */
export function readShared(value: unknown): SharedAnswer | undefined {
  if (!isPlainObject(value) || !isSharedBy(value.by)) return undefined;
  return { by: value.by, ...(typeof value.with === "string" && { with: value.with }) };
}
