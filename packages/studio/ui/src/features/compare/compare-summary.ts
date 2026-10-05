import { endpointKeyOf } from "@/features/explorer/endpoint-key";
import { codeLabel } from "@/features/requests/request-parts";
import { isFailedState } from "@/features/requests/request-state";
import { formatClockTime, formatDuration, formatSize } from "@/lib/formatters";
import type { RequestEntry } from "@/store/types-request";
import type { Delta } from "./delta";
import { deltaOf } from "./delta";

/** One figure of the comparison: its value on each side and how it moved. */
export interface SummaryCell {
  label: string;
  a: string;
  b: string;
  delta: Delta & { icon: "same" | "up" | "down" | "worse" | "better" | "clock" };
}

function statusCell(a: RequestEntry, b: RequestEntry): SummaryCell {
  const failedA = isFailedState(a.status);
  const failedB = isFailedState(b.status);
  const codeA = codeLabel(a, a.status);
  const codeB = codeLabel(b, b.status);
  const delta: SummaryCell["delta"] =
    codeA === codeB
      ? { label: "same", direction: "same", tone: "muted", icon: "same" }
      : failedB && !failedA
        ? { label: "regressed", direction: "down", tone: "err", icon: "worse" }
        : failedA && !failedB
          ? { label: "recovered", direction: "up", tone: "ok", icon: "better" }
          : { label: "changed", direction: "same", tone: "muted", icon: "same" };
  return { label: "Status", a: codeA, b: codeB, delta };
}

function moved(delta: Delta): SummaryCell["delta"] {
  return { ...delta, icon: delta.direction };
}

/**
 * The comparison at a glance: the two calls' status — the same, regressed
 * or recovered — their durations and sizes with how they moved, and how
 * far apart they were made.
 *
 * @param a - The left call
 * @param b - The right call
 * @returns The four figures
 * @example
 * ```ts
 * compareSummary(ok, failed)[0]?.delta.label; // "regressed"
 * ```
 */
export function compareSummary(a: RequestEntry, b: RequestEntry): SummaryCell[] {
  const ta = a.timing?.total ?? 0;
  const tb = b.timing?.total ?? 0;
  const apart = formatDuration(Math.abs(b.startedAt - a.startedAt));
  const same = endpointKeyOf(a) === endpointKeyOf(b);
  return [
    statusCell(a, b),
    {
      label: "Duration",
      a: formatDuration(ta),
      b: formatDuration(tb),
      delta: moved(deltaOf(ta, tb)),
    },
    {
      label: "Size",
      a: formatSize(a.size ?? 0),
      b: formatSize(b.size ?? 0),
      delta: moved(deltaOf(a.size ?? 0, b.size ?? 0)),
    },
    {
      label: "Time apart",
      a: formatClockTime(a.startedAt),
      b: formatClockTime(b.startedAt),
      delta: {
        label: `${apart} · ${same ? "same endpoint" : "different endpoints"}`,
        direction: "same",
        tone: "muted",
        icon: "clock",
      },
    },
  ];
}
