import { formatClockTime, formatDuration, formatRelativeTime, formatSize } from "@/lib/formatters";
import type { RequestEntry } from "@/store/types";
import type { DurationTone } from "./duration-tone";
import { durationTone } from "./duration-tone";
import type { StateTone } from "./request-state";
import { isStreamRequest, requestStateOf, STATE_META } from "./request-state";
import { streamEnd } from "./stream-activity";
import { connectionTroubleOf, troubleTitle } from "./stream-connection";

/** One of the four figures over the inspector's tabs. */
export interface StatCell {
  label: string;
  value: string;
  /** A line under the value; a cell without one has none. */
  sub?: string | undefined;
  tone: StateTone | DurationTone;
  mono: boolean;
}

/** What the figures need beyond the request. */
export interface StatContext {
  now: number;
  /** When the saved session shown ended: a stream open then is read against it. */
  endedAt?: number | undefined;
  slowMs: number;
  /** The p95 of the request's endpoint, when any call to it finished. */
  p95: number | null;
}

function contentKind(headers: RequestEntry["headers"]): string {
  const type = Object.entries(headers ?? {}).find(([k]) => k.toLowerCase() === "content-type")?.[1];
  const subtype = type?.split(";")[0]?.split("/")[1]?.trim();
  return subtype?.replace(/^.*\+/, "") || "—";
}

function statusCell(r: RequestEntry): StatCell {
  const state = requestStateOf(r);
  const trouble = connectionTroubleOf(r);
  /* A stream that closed while its connection was not open closed with nothing to show for it. */
  const unopened =
    state === "closed" && r.streamConnection !== undefined && r.streamConnection.status !== "open";
  const meta = trouble
    ? { label: troubleTitle(trouble), tone: "warn" as const }
    : unopened
      ? { label: STATE_META.closed.label, tone: "warn" as const }
      : STATE_META[state];
  const stream = isStreamRequest(r) ? (r.transport === "ws" ? "WebSocket" : "SSE") : undefined;
  const code = r.statusCode ? String(r.statusCode) : undefined;
  const sub = stream
    ? `${stream}${code ? ` · ${code}` : ""}`
    : code
      ? `HTTP ${code}`
      : state === "pending"
        ? "in flight"
        : "no response";
  return {
    label: "Status",
    value: meta.label,
    sub,
    tone: meta.tone,
    mono: false,
  };
}

/**
 * The four figures over the inspector's tabs: the status; how long the
 * request took, against its endpoint's p95, or how long a stream has been
 * open; its size, or a stream's message count and bytes; and when it began.
 *
 * @param r - The request
 * @param context - The time now, the slow threshold and the endpoint's p95
 * @returns The four cells
 * @example
 * ```ts
 * statCellsOf(request, { now: Date.now(), slowMs: 500, p95: 153 })[1]; // { label: "Duration", value: "125ms", sub: "p95 153ms", … }
 * ```
 */
export function statCellsOf(r: RequestEntry, context: StatContext): StatCell[] {
  const { now, endedAt, slowMs, p95 } = context;
  const state = requestStateOf(r);
  const started: StatCell = {
    label: "Started",
    value: formatClockTime(r.startedAt),
    sub: formatRelativeTime(r.startedAt, now),
    tone: "normal",
    mono: true,
  };
  if (isStreamRequest(r)) {
    const open = streamEnd(r, endedAt ?? now) - r.startedAt;
    const count = Math.max(r.streamEventCount ?? 0, r.streamEvents?.length ?? 0);
    const bytes = r.streamTotalBytes ?? (r.streamEvents ?? []).reduce((s, e) => s + e.dataSize, 0);
    const closed = formatRelativeTime(streamEnd(r, endedAt ?? now), now);
    return [
      statusCell(r),
      {
        label: "Open for",
        value: formatDuration(open),
        sub:
          state !== "streaming"
            ? `closed ${closed}`
            : endedAt === undefined
              ? (connectionTroubleOf(r)?.status ?? "live")
              : "open when saved",
        tone: "normal",
        mono: true,
      },
      {
        label: "Messages",
        value: String(count),
        sub: formatSize(bytes),
        tone: "normal",
        mono: true,
      },
      started,
    ];
  }
  const total = r.timing?.total;
  const duration: StatCell =
    total === undefined
      ? {
          label: "Duration",
          value: state === "pending" ? "···" : "—",
          sub: "",
          tone: "normal",
          mono: true,
        }
      : {
          label: "Duration",
          value: formatDuration(total),
          /* A call another call's request answered waited for it: its time is no request's to set against the p95. */
          sub: r.shared
            ? "waited for another call"
            : p95 === null
              ? ""
              : `p95 ${formatDuration(p95)}`,
          tone: durationTone(total, slowMs),
          mono: true,
        };
  const size: StatCell = {
    label: "Size",
    value: r.size ? formatSize(r.size) : "—",
    sub: contentKind(r.headers),
    tone: "normal",
    mono: true,
  };
  return [statusCell(r), duration, size, started];
}
