import { formatDuration, formatRelativeTime } from "@/lib/formatters";
import type { RequestEntry } from "@/store/types";
import { requestStateOf } from "./request-state";
import { closedBy, closedOrdinarily } from "./stream-close";
import { troubleText } from "./stream-connection";

/**
 * When a stream stopped, or now while it streams — never before it opened:
 * a page's clock ticks every few seconds, so it can be behind a stream
 * that opened since.
 *
 * @param r - The stream
 * @param now - The time now
 * @returns The time
 * @example
 * ```ts
 * streamEnd(closed, Date.now()); // its start plus how long it was open
 * ```
 */
export function streamEnd(
  r: Pick<RequestEntry, "transport" | "streamStatus" | "status" | "startedAt" | "streamDuration">,
  now: number,
): number {
  return requestStateOf(r) === "streaming" || r.streamDuration === undefined
    ? Math.max(now, r.startedAt)
    : r.startedAt + r.streamDuration;
}

/**
 * How a stream's messages spread over its last minute at most: their
 * count in each of a number of equal spans, scaled to the busiest.
 *
 * @param r - The stream
 * @param now - The time now
 * @param buckets - How many spans
 * @returns The heights, 0–1, oldest first, and the span they cover
 * @example
 * ```ts
 * streamSparkline(stream, Date.now()).heights.length; // 30
 * ```
 */
export function streamSparkline(
  r: RequestEntry,
  now: number,
  buckets = 30,
): { heights: number[]; span: number } {
  const end = streamEnd(r, now);
  const span = Math.min(60_000, Math.max(3_000, end - r.startedAt));
  const width = span / buckets;
  const counts = Array.from({ length: buckets }, () => 0);
  for (const e of r.streamEvents ?? []) {
    const i = Math.floor((e.timestamp - (end - span)) / width);
    if (i >= 0 && i < buckets) counts[i] = (counts[i] ?? 0) + 1;
  }
  const top = Math.max(1, ...counts);
  return { heights: counts.map((c) => c / top), span };
}

/** How a stream's end is told: in the colour of a close that went as streams go, one to look into, or a failure. */
export interface StreamEnding {
  tone: "ok" | "warn" | "err";
  title: string;
  detail: string;
}

/**
 * How a stream ended, once it has: completed, closed by its caller, its
 * server or its lifetime; closed while its connection was being opened or
 * opened again, with why the last one ended; or failed, with the error.
 *
 * @param r - The stream
 * @param now - The time now
 * @returns What to say of its end; `null` while it streams
 * @example
 * ```ts
 * streamEnding(stream, Date.now())?.title; // "Stream completed"
 * ```
 */
export function streamEnding(r: RequestEntry, now: number): StreamEnding | null {
  const state = requestStateOf(r);
  if (state === "streaming") return null;
  const ago = formatRelativeTime(streamEnd(r, now), now);
  if (state === "error") {
    const detail = `${r.error?.message ?? "no reason given"} · ${ago}`;
    return { tone: "err", title: "Closed with an error", detail };
  }
  const open = r.streamDuration === undefined ? "" : ` after ${formatDuration(r.streamDuration)}`;
  const last = r.streamConnection;
  if (last !== undefined && last.status !== "open") {
    const why = last.status === "reconnecting" ? `${troubleText(last)} · ` : "";
    return {
      tone: "warn",
      title: `${closedBy(r)} while ${last.status}`,
      detail: `${why}closed${open} · ${ago}`,
    };
  }
  const completed = r.streamCloseReason === undefined || r.streamCloseReason === "complete";
  return {
    tone: closedOrdinarily(r) ? "ok" : "warn",
    title: completed ? "Stream completed" : closedBy(r),
    detail: `closed${open} · ${ago}`,
  };
}
