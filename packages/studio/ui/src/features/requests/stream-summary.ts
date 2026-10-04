import { formatRelativeTime, formatSize } from "@/lib/formatters";
import type { RequestEntry, StreamEventRecord } from "@/store/types";
import { streamEnd } from "./stream-activity";

/** A message of a stream, as the Messages tab lists it. */
export interface StreamMessage {
  seq: number;
  /** For a WebSocket, which way it went; a server-sent event is always `event`. */
  direction: "sent" | "received" | "event";
  type: string;
  preview: string;
  size: number;
  at: number;
  /** When it came, in ms after the stream opened. */
  offset: number;
  /** Whether Courier kept only the start of it. */
  truncated: boolean;
}

/* The payload's own `type`, when it is JSON that names one. */
function payloadType(preview: string | undefined): string | undefined {
  if (!preview?.startsWith("{")) return undefined;
  const match = /^\{\s*"type"\s*:\s*"([^"]{1,64})"/.exec(preview);
  return match?.[1];
}

function messageOf(r: RequestEntry, e: StreamEventRecord): StreamMessage {
  const direction =
    r.transport === "ws" ? (e.eventType === "message" ? "sent" : "received") : "event";
  const fallback = r.transport === "ws" ? direction : (e.eventType ?? "message");
  return {
    seq: e.seq,
    direction,
    type: payloadType(e.dataPreview) ?? fallback,
    preview: e.dataPreview ?? `${e.dataSize} B`,
    size: e.dataSize,
    at: e.timestamp,
    offset: e.timestamp - r.startedAt,
    truncated: e.dataPreview?.endsWith("…") === true && e.dataSize > e.dataPreview.length - 1,
  };
}

/**
 * The messages Courier kept of a stream, newest first.
 *
 * @param r - The stream
 * @returns The messages
 * @example
 * ```ts
 * streamMessages(stream)[0]?.direction; // "received"
 * ```
 */
export function streamMessages(r: RequestEntry): StreamMessage[] {
  return (r.streamEvents ?? []).map((e) => messageOf(r, e)).reverse();
}

/** A figure of a stream, as the Messages tab shows four of them. */
export interface StreamStat {
  label: string;
  value: string;
  tone: "brand" | "ok" | "normal";
}

/**
 * What a stream came to: for a WebSocket the messages sent and received,
 * for an event stream how many events and when the last came — with the
 * bytes and the rate for both.
 *
 * @param r - The stream
 * @param now - The time now
 * @returns Four figures
 * @example
 * ```ts
 * streamStats(socket, Date.now()).map((s) => s.label); // ["Sent", "Received", "Transferred", "Rate"]
 * ```
 */
export function streamStats(r: RequestEntry, now: number): StreamStat[] {
  const events = r.streamEvents ?? [];
  const count = Math.max(r.streamEventCount ?? 0, events.length);
  const bytes = r.streamTotalBytes ?? events.reduce((sum, e) => sum + e.dataSize, 0);
  const seconds = Math.max(1, (streamEnd(r, now) - r.startedAt) / 1000);
  const transferred = { label: "Transferred", value: formatSize(bytes), tone: "normal" as const };
  const rate = {
    label: "Rate",
    value: `${(count / seconds).toFixed(1)}/s`,
    tone: "normal" as const,
  };
  if (r.transport === "ws") {
    const sent = events.filter((e) => e.eventType === "message").length;
    return [
      { label: "Sent", value: String(sent), tone: "brand" },
      { label: "Received", value: String(events.length - sent), tone: "ok" },
      transferred,
      rate,
    ];
  }
  const last = events.at(-1);
  const lastEvent = last ? formatRelativeTime(last.timestamp, now) : "—";
  return [
    { label: "Events", value: String(count), tone: "normal" },
    transferred,
    rate,
    { label: "Last event", value: lastEvent, tone: "normal" },
  ];
}
