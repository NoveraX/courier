import { durationTone } from "@/features/requests/duration-tone";
import { httpStatusText } from "@/features/requests/http-status-text";
import type { RequestState } from "@/features/requests/request-state";
import { requestStateOf, STATE_META } from "@/features/requests/request-state";
import type { StatCell } from "@/features/requests/stat-cells";
import { formatDuration, formatRelativeTime, formatSize } from "@/lib/formatters";
import type { RequestEntry } from "@/store/types";
import type { PlaygroundHistoryEntry } from "@/store/types-ui";

/** What the response's figures are worked out from. */
export interface CellInput {
  /** The run shown, if any was sent. */
  entry: PlaygroundHistoryEntry | null;
  /** The request the run made, once the runtime reported it. */
  row: RequestEntry | undefined;
  now: number;
  slowMs: number;
}

const DASH: StatCell = { label: "", value: "—", tone: "muted", mono: true };

const NOT_SENT: readonly StatCell[] = [
  {
    label: "Status",
    value: "Not sent",
    dot: { tone: "muted", pulse: false },
    tone: "muted",
    mono: false,
  },
  { ...DASH, label: "Duration" },
  { ...DASH, label: "Size" },
  { ...DASH, label: "Sent" },
];

const STREAM_STATES: Readonly<
  Record<NonNullable<PlaygroundHistoryEntry["streamStatus"]>, RequestState | "connecting">
> = {
  connecting: "connecting",
  streaming: "streaming",
  complete: "closed",
  error: "error",
};

function statusCell(state: RequestState, label: string, value: string): StatCell {
  const { tone } = STATE_META[state];
  const pulse = state === "pending" || state === "streaming";
  return { label, value, dot: { tone, pulse }, tone, mono: false };
}

function httpCells(
  entry: PlaygroundHistoryEntry,
  row: RequestEntry | undefined,
  slowMs: number,
): StatCell[] {
  const state: RequestState = row
    ? requestStateOf(row)
    : entry.status === "error"
      ? "error"
      : "success";
  const code = row?.statusCode ?? entry.statusCode;
  const reason =
    state === "validation_error" ? "schema mismatch" : code ? httpStatusText(code) : undefined;
  const total = row?.timing?.total ?? entry.duration;
  return [
    statusCell(
      state,
      reason ? `Status · ${reason}` : "Status",
      code ? String(code) : STATE_META[state].label,
    ),
    total === undefined
      ? { ...DASH, label: "Duration" }
      : {
          label: "Duration",
          value: formatDuration(total),
          tone: durationTone(total, slowMs),
          mono: true,
        },
    row?.size === undefined
      ? { ...DASH, label: "Size" }
      : { label: "Size", value: formatSize(row.size), tone: "normal", mono: true },
  ];
}

function streamCells(
  entry: PlaygroundHistoryEntry,
  row: RequestEntry | undefined,
  now: number,
): StatCell[] {
  const state = row ? requestStateOf(row) : STREAM_STATES[entry.streamStatus ?? "connecting"];
  const status =
    state === "connecting"
      ? { ...statusCell("pending", "Status", "Connecting…") }
      : statusCell(state, "Status", STATE_META[state].label);
  const open = entry.duration ?? Math.max(0, now - entry.timestamp);
  const count = row
    ? Math.max(row.streamEventCount ?? 0, row.streamEvents?.length ?? 0)
    : (entry.chunks?.length ?? 0) + (entry.chunksDropped ?? 0);
  return [
    status,
    { label: "Open for", value: formatDuration(open), tone: "normal", mono: true },
    { label: "Messages", value: String(count), tone: "normal", mono: true },
  ];
}

/**
 * The response's four figures: how the run went — its status code and its
 * reason, or a stream's state — how long it took or has been open, its
 * size or its messages, and when it was sent. Before anything is sent,
 * each says so; while a call is in flight, it counts up.
 *
 * @param input - The run, the request it made, the time and the slow threshold
 * @returns The figures
 * @example
 * ```ts
 * playgroundCells({ entry, row, now: Date.now(), slowMs: 500 })[0]?.label; // "Status · Created"
 * ```
 */
export function playgroundCells({ entry, row, now, slowMs }: CellInput): readonly StatCell[] {
  if (!entry) return NOT_SENT;
  const sent: StatCell = {
    label: "Sent",
    value: formatRelativeTime(entry.timestamp, now),
    tone: "normal",
    mono: true,
  };
  if (entry.transport) return [...streamCells(entry, row, now), sent];
  const inFlight = entry.status === "pending" && (!row || requestStateOf(row) === "pending");
  if (!inFlight) return [...httpCells(entry, row, slowMs), sent];
  return [
    statusCell("pending", "Status", "Sending…"),
    {
      label: "Duration",
      value: formatDuration(Math.max(0, now - entry.timestamp)),
      tone: "warn",
      mono: true,
    },
    { ...DASH, label: "Size" },
    sent,
  ];
}
