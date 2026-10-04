import type { StudioInfo } from "@/store/studio-info";

import { isPlainObject } from "./is-plain-object";

/**
 * Whether a `studio:info` payload is one the UI understands: a non-empty
 * version and project name.
 *
 * @param data - The payload as Socket.IO delivered it
 * @returns Whether it is a well-formed `StudioInfo`
 * @example
 * ```ts
 * socket.on("studio:info", (data: unknown) => {
 *   if (isStudioInfo(data)) store().setStudioInfo(data);
 * });
 * ```
 */
export function isStudioInfo(data: unknown): data is StudioInfo {
  if (!isPlainObject(data) || !isPlainObject(data.project)) return false;
  return isFilled(data.version) && isFilled(data.project.name);
}

function isFilled(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}
