import type { ExperimentEvent } from "@/store/mock-slice";

/* The modes a chaos run has; an auto-halt names none of its own ("chaos"). */
const CHAOS_MODES: ReadonlySet<string> = new Set(["degraded", "unstable", "down", "custom"]);

/** A line of a mock's experiment log. */
export interface ExperimentLine {
  id: string;
  type: ExperimentEvent["type"];
  /** What ran: a chaos mode, or a latency preset. */
  mode: string;
  at: number;
  /** How long it ran, for a stop or a halt. */
  ranMs: number | undefined;
  reason: string | undefined;
}

function startOf(
  event: ExperimentEvent,
  older: readonly ExperimentEvent[],
): ExperimentEvent | undefined {
  if (event.type === "started") return undefined;
  const halted = event.type === "auto-halted";
  return older.find(
    (e) => e.type === "started" && (halted ? CHAOS_MODES.has(e.mode) : e.mode === event.mode),
  );
}

/**
 * A mock's chaos and latency runs, newest first: each start, stop and
 * automatic halt, a stop or halt with how long its run lasted — as the
 * mock reports it, else from the run's start in the log.
 *
 * @param events - Every mock's experiment events, newest first
 * @param serverId - The mock
 * @returns Its log
 * @example
 * ```ts
 * experimentLog(history, "shop")[0]; // { type: "stopped", mode: "degraded", ranMs: 42000, … }
 * ```
 */
export function experimentLog(
  events: readonly ExperimentEvent[],
  serverId: string,
): ExperimentLine[] {
  const own = events.filter((e) => e.serverId === serverId);
  return own.map((event, i) => {
    const start = startOf(event, own.slice(i + 1));
    return {
      id: event.id,
      type: event.type,
      mode: start?.mode ?? event.mode,
      at: event.timestamp,
      ranMs: event.durationMs ?? (start ? event.timestamp - start.timestamp : undefined),
      reason: event.reason,
    };
  });
}

/**
 * How long a run lasted, in seconds, then minutes and seconds.
 *
 * @param ms - The length
 * @returns Its label
 * @example
 * ```ts
 * runLength(83_000); // "1m 23s"
 * ```
 */
export function runLength(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1_000));
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
}
