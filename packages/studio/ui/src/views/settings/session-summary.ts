import { isPlainObject } from "@/socket/is-plain-object";

/** A saved session as Studio lists it: its name, its span and its counts. */
export interface SessionSummary {
  id: string;
  name: string;
  savedAt: number;
  startedAt: number;
  duration: number;
  stats: {
    totalRequests: number;
    successCount: number;
    errorCount: number;
    avgDuration: number;
    totalSize: number;
  };
  appCount: number;
}

const STAT_FIELDS = [
  "totalRequests",
  "successCount",
  "errorCount",
  "avgDuration",
  "totalSize",
] as const;

/**
 * The saved sessions in Studio's answer to `/api/sessions/list`, which is
 * the list itself, newest first.
 *
 * @param data - Studio's answer
 * @returns The sessions
 * @throws Error when the answer is not a list of session summaries
 *
 * @example
 * ```ts
 * const sessions = sessionSummariesOf(await post("/api/sessions/list"));
 * ```
 */
export function sessionSummariesOf(data: unknown): SessionSummary[] {
  if (!Array.isArray(data) || !data.every(isSessionSummary)) {
    throw new Error("Studio's list of saved sessions could not be read");
  }
  return data;
}

function isSessionSummary(item: unknown): item is SessionSummary {
  return (
    isPlainObject(item) &&
    typeof item.id === "string" &&
    typeof item.name === "string" &&
    typeof item.savedAt === "number" &&
    typeof item.startedAt === "number" &&
    typeof item.duration === "number" &&
    typeof item.appCount === "number" &&
    hasStats(item.stats)
  );
}

function hasStats(stats: unknown): boolean {
  return isPlainObject(stats) && STAT_FIELDS.every((field) => typeof stats[field] === "number");
}
