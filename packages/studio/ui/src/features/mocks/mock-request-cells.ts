import { durationTone } from "@/features/requests/duration-tone";
import { httpStatusText } from "@/features/requests/http-status-text";
import type { StateTone } from "@/features/requests/request-state";
import type { StatCell } from "@/features/requests/stat-cells";
import { formatClockTime, formatDuration, formatRelativeTime } from "@/lib/formatters";
import type { MockRequestLog } from "@/store/mock-slice";
import { logTag } from "./logs-view";
import { mockLogCode, mockLogTone } from "./mock-log";

const TAG_TONE: Readonly<Record<ReturnType<typeof logTag>["tone"], StateTone>> = {
  err: "err",
  warn: "warn",
  keyword: "brand",
  subtle: "muted",
};

function statusCell(log: MockRequestLog): StatCell {
  const answered = log.status !== undefined || log.error !== undefined;
  const tone: StateTone = answered ? mockLogTone(log) : "muted";
  const reason = log.status === undefined ? undefined : httpStatusText(log.status);
  return {
    label: "Status",
    value: answered ? mockLogCode(log) : "In flight",
    sub: reason ?? (log.error === undefined ? undefined : "no answer"),
    dot: { tone, pulse: !answered },
    tone,
    mono: answered,
  };
}

/**
 * The four figures over a mock request's tabs: its status and reason, how
 * long the mock took against the slow threshold, what answered it — the
 * generated handler, an override, the scenario on, or a fault chaos
 * injected — and when it came.
 *
 * @param log - The request the mock logged
 * @param now - The time now
 * @param slowMs - Studio's slow-request threshold
 * @returns The figures
 * @example
 * ```ts
 * mockRequestCells(log, Date.now(), 500).map((c) => c.label); // ["Status", "Duration", "Answered by", "Time"]
 * ```
 */
export function mockRequestCells(log: MockRequestLog, now: number, slowMs: number): StatCell[] {
  const tag = logTag(log);
  return [
    statusCell(log),
    log.duration === undefined
      ? { label: "Duration", value: "—", tone: "muted", mono: true }
      : {
          label: "Duration",
          value: formatDuration(log.duration),
          tone: durationTone(log.duration, slowMs),
          mono: true,
        },
    { label: "Answered by", value: tag.tag, tone: TAG_TONE[tag.tone], mono: false },
    {
      label: "Time",
      value: formatClockTime(log.timestamp),
      sub: formatRelativeTime(log.timestamp, now),
      tone: "normal",
      mono: true,
    },
  ];
}
