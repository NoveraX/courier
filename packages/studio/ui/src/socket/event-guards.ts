import type { StudioEvent } from "@/store/types-events";

export function isStudioEvent(value: unknown): value is StudioEvent & Record<string, unknown> {
  if (typeof value !== "object" || value === null) return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.id === "string" &&
    typeof obj.type === "string" &&
    typeof obj.timestamp === "number" &&
    typeof obj.sessionId === "string"
  );
}
