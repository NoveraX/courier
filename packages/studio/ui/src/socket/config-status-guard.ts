import type { ConfigStatusPayload } from "@/store/config-status";

import { isPlainObject } from "./is-plain-object";

/**
 * Whether a `config:status` payload is one the UI understands. Every field
 * of its state is checked, and a state the UI does not know is refused, so
 * the store and the views can rely on the declared type.
 *
 * @param data - The payload as Socket.IO delivered it
 * @returns Whether it is a well-formed `ConfigStatusPayload`
 *
 * @example
 * ```ts
 * socket.on("config:status", (data: unknown) => {
 *   if (isConfigStatusPayload(data)) store().setConfigStatus(data);
 * });
 * ```
 */
export function isConfigStatusPayload(data: unknown): data is ConfigStatusPayload {
  if (!isPlainObject(data)) return false;
  switch (data.state) {
    case "starting":
      return data.revision === 0;
    case "loaded":
      return (
        isOutcomeRevision(data.revision) &&
        typeof data.configFile === "string" &&
        isTime(data.loadedAt)
      );
    case "failed":
      return isFailed(data);
    case "missing":
      return (
        isOutcomeRevision(data.revision) &&
        isFileOrNull(data.configFile) &&
        isTime(data.missingAt) &&
        isTimeOrNull(data.lastGoodAt)
      );
    default:
      return false;
  }
}

function isFailed(data: Record<string, unknown>): boolean {
  return (
    isOutcomeRevision(data.revision) &&
    isFileOrNull(data.configFile) &&
    isLoadError(data.error) &&
    isTime(data.failedAt) &&
    isTimeOrNull(data.lastGoodAt)
  );
}

function isLoadError(error: unknown): boolean {
  return (
    isPlainObject(error) && typeof error.code === "string" && typeof error.message === "string"
  );
}

/* Every outcome of a load counts one, so a status after one is at least 1. */
function isOutcomeRevision(value: unknown): boolean {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 1;
}

function isFileOrNull(value: unknown): boolean {
  return value === null || typeof value === "string";
}

function isTime(value: unknown): boolean {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isTimeOrNull(value: unknown): boolean {
  return value === null || isTime(value);
}
