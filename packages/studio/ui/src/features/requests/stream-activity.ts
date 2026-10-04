import { formatDuration, formatRelativeTime } from "@/lib/formatters";
import type { RequestEntry } from "@/store/types";
import { requestStateOf } from "./request-state";

/**
 * When a stream stopped, or now while it streams.
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
    ? now
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

/**
 * How a stream ended, once it has.
 *
 * @param r - The stream
 * @param now - The time now
 * @returns Whether it completed or failed, and what to say of it; `null` while it streams
 * @example
 * ```ts
 * streamEnding(stream, Date.now())?.title; // "Stream completed"
 * ```
 */
export function streamEnding(
  r: RequestEntry,
  now: number,
): { failed: boolean; title: string; detail: string } | null {
  const state = requestStateOf(r);
  if (state === "streaming") return null;
  const ago = formatRelativeTime(streamEnd(r, now), now);
  if (state === "error") {
    return {
      failed: true,
      title: "Closed with an error",
      detail: `${r.error?.message ?? "no reason given"} · ${ago}`,
    };
  }
  const open = r.streamDuration === undefined ? "" : ` after ${formatDuration(r.streamDuration)}`;
  return { failed: false, title: "Stream completed", detail: `closed${open} · ${ago}` };
}
