import type { StudioEvent } from "@/store/types-events";
import { isPlainObject } from "./is-plain-object";

export function isStudioEvent(value: unknown): value is StudioEvent & Record<string, unknown> {
  if (!isPlainObject(value)) return false;
  return (
    typeof value.id === "string" &&
    typeof value.type === "string" &&
    typeof value.timestamp === "number" &&
    typeof value.sessionId === "string"
  );
}
