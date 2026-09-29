import { PLAYGROUND_MAX_HISTORY } from "./constants";
import type { PlaygroundHistoryEntry } from "./types-ui";

/* An answer bigger than this is not kept across reloads; its entry says so. */
const MAX_KEPT_ANSWER = 64 * 1024;
/* A stream keeps its latest messages. */
const MAX_KEPT_CHUNKS = 50;

const INTERRUPTED = "The page was reloaded before the answer arrived.";

/**
 * The Playground history Studio kept for the project, as the page left it.
 *
 * A call still running then never gets its answer, so it is shown as
 * interrupted rather than as pending for good. An entry this page cannot
 * read is left out.
 *
 * @param raw - What Studio sent with `playground:history`
 * @returns The entries, newest first; none for anything that is not a history
 *
 * @example
 * ```ts
 * socket.on("playground:history", (raw) => setHistory(readPlaygroundHistory(raw)))
 * ```
 */
export function readPlaygroundHistory(raw: unknown): PlaygroundHistoryEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(isEntry).slice(0, PLAYGROUND_MAX_HISTORY).map(settled);
}

/**
 * The Playground history as Studio keeps it: an answer too large to keep is
 * a note that says so, and a stream keeps its latest messages.
 *
 * @param entries - The history, newest first
 * @returns The entries to keep
 *
 * @example
 * ```ts
 * socket.emit("playground:history:save", keptPlaygroundHistory(history))
 * ```
 */
export function keptPlaygroundHistory(
  entries: readonly PlaygroundHistoryEntry[],
): PlaygroundHistoryEntry[] {
  return entries.map(kept);
}

function kept(entry: PlaygroundHistoryEntry): PlaygroundHistoryEntry {
  const chunks = entry.chunks?.slice(-MAX_KEPT_CHUNKS);
  const shed = (entry.chunks?.length ?? 0) - (chunks?.length ?? 0);
  const size = JSON.stringify(entry.response ?? null).length;
  const response =
    size > MAX_KEPT_ANSWER
      ? `The answer (${size} characters) was too large to keep across reloads.`
      : entry.response;
  return {
    ...entry,
    response,
    ...(chunks && { chunks }),
    ...(shed > 0 && { chunksDropped: (entry.chunksDropped ?? 0) + shed }),
  };
}

function settled(entry: PlaygroundHistoryEntry): PlaygroundHistoryEntry {
  if (entry.status !== "pending") return entry;
  return {
    ...entry,
    status: "error",
    response: INTERRUPTED,
    ...(entry.streamStatus && { streamStatus: "error" }),
  };
}

function isEntry(value: unknown): value is PlaygroundHistoryEntry {
  if (typeof value !== "object" || value === null) return false;
  const field = (key: string): unknown => Reflect.get(value, key);
  const status = field("status");
  return (
    ["id", "rid", "source", "method"].every((key) => typeof field(key) === "string") &&
    (status === "pending" || status === "success" || status === "error")
  );
}
