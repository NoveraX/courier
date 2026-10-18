import { createLogger } from "@noverax/courier";
import type { SavedSession, SessionStats } from "./session-types";
import { isObject } from "./validate-body";

const log = createLogger("Studio");

const STAT_KEYS = [
  "totalRequests",
  "successCount",
  "errorCount",
  "avgDuration",
  "totalSize",
] as const;

/* A session saved before calls were counted apart from requests has no count of its calls. */
function isStats(value: unknown): value is SessionStats {
  return (
    isObject(value) &&
    STAT_KEYS.every((key) => typeof value[key] === "number") &&
    (value.totalCalls === undefined || typeof value.totalCalls === "number")
  );
}

function isSavedSession(value: unknown): value is SavedSession {
  if (!isObject(value)) return false;
  const { id, name, savedAt, startedAt, duration, apps, requests, stats } = value;
  return (
    typeof id === "string" &&
    typeof name === "string" &&
    [savedAt, startedAt, duration].every((n) => typeof n === "number") &&
    Array.isArray(apps) &&
    apps.every(isObject) &&
    Array.isArray(requests) &&
    requests.every(isObject) &&
    isStats(stats)
  );
}

/**
 * Read a saved session's file. A file in `.courier/sessions` may have been
 * edited or arrived with the project, so its content is checked rather than
 * trusted.
 *
 * @param text - The file's text
 * @returns The session, or `null` when the text is not one Studio saved
 * @example
 * ```ts
 * readSavedSession(readFileSync(path, "utf-8"))?.requests.length;
 * ```
 */
export function readSavedSession(text: string): SavedSession | null {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    log.debug("A saved session is not JSON", error);
    return null;
  }
  return isSavedSession(value) ? value : null;
}
