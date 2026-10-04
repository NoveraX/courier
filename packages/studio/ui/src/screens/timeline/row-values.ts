import { durationTone } from "@/features/requests/duration-tone";
import type { RequestState } from "@/features/requests/request-state";
import { isStreamRequest } from "@/features/requests/request-state";
import { streamEnd } from "@/features/requests/stream-activity";
import { formatDuration, formatSize } from "@/lib/formatters";
import type { RequestEntry, TimestampFormat } from "@/store/types";

/** What a row needs beyond its request. */
export interface RowContext {
  now: number;
  slowMs: number;
  timestamps: TimestampFormat;
  /** Whether the list is wide enough for the Mode and Size columns. */
  wide: boolean;
}

/**
 * The colour of a row's status: a stream's own, an error's, a broken
 * schema's, a success's, or muted while it runs or once aborted.
 *
 * @param r - The request
 * @param state - Its state
 * @returns The text class
 * @example
 * ```ts
 * codeTone(request, "error"); // "text-err"
 * ```
 */
export function codeTone(r: RequestEntry, state: RequestState): string {
  if (isStreamRequest(r))
    return state === "error"
      ? "text-err"
      : r.transport === "ws"
        ? "text-syntax-keyword"
        : "text-brand";
  if (state === "pending" || state === "aborted") return "text-fg-subtle";
  if (state === "validation_error") return "text-warn";
  return (r.statusCode ?? 0) >= 400 || state === "error" ? "text-err" : "text-ok";
}

/** A row's duration, as its cell shows it. */
export interface DurationCell {
  text: string;
  /** The text's colour class. */
  tone: string;
  /** The bar's width, in percent of a second. */
  bar: number;
  /** The bar's fill class. */
  fill: string;
}

/**
 * A row's duration: its text, its colour, and the bar beside it — its
 * share of a second; a stream's time open, and how long one in flight has
 * run so far.
 *
 * @param r - The request
 * @param state - Its state
 * @param context - The time now and the slow threshold
 * @returns The text, its colour, the bar's width in percent and its fill
 * @example
 * ```ts
 * durationOf(request, "success", context).text; // "125ms"
 * ```
 */
export function durationOf(
  r: RequestEntry,
  state: RequestState,
  { now, slowMs }: RowContext,
): DurationCell {
  if (isStreamRequest(r)) {
    const open = formatDuration(streamEnd(r, now) - r.startedAt);
    const live = state === "streaming";
    return {
      text: live ? `live ${open}` : open,
      tone: live ? "text-brand" : "text-fg-muted",
      bar: 100,
      fill: live ? "bg-brand" : "bg-line-strong",
    };
  }
  if (state === "pending") {
    const elapsed = now - r.startedAt;
    return {
      text: formatDuration(Math.max(0, elapsed)),
      tone: "text-warn",
      bar: Math.min(100, elapsed / 10),
      fill: "bg-warn",
    };
  }
  const total = r.timing?.total;
  if (state === "aborted" || total === undefined)
    return { text: "—", tone: "text-fg-subtle", bar: 0, fill: "bg-line" };
  const tone = durationTone(total, slowMs);
  return {
    text: formatDuration(total),
    tone: tone === "err" ? "text-err" : tone === "warn" ? "text-warn" : "text-fg-muted",
    bar: Math.min(100, Math.max(3, total / 10)),
    fill: tone === "err" ? "bg-err" : tone === "warn" ? "bg-warn" : "bg-brand",
  };
}

/**
 * A row's size: the answer's, or a stream's message count.
 *
 * @param r - The request
 * @param state - Its state
 * @returns The label
 * @example
 * ```ts
 * sizeOf(stream, "streaming"); // "12 msg"
 * ```
 */
export function sizeOf(r: RequestEntry, state: RequestState): string {
  if (isStreamRequest(r))
    return `${Math.max(r.streamEventCount ?? 0, r.streamEvents?.length ?? 0)} msg`;
  if (state === "pending") return "—";
  return formatSize(r.size ?? 0);
}
