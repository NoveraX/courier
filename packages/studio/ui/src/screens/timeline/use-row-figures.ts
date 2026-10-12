import { endpointParts, httpMethodOf } from "@/features/requests/request-parts";
import type { RequestState } from "@/features/requests/request-state";
import { isStreamRequest, requestStateOf } from "@/features/requests/request-state";
import { useSecondNow } from "@/hooks/use-tick";
import { formatAbsoluteTime, formatRelativeTime } from "@/lib/formatters";
import type { RequestEntry } from "@/store/types";
import type { DurationCell, RowContext } from "./row-values";
import { durationOf } from "./row-values";

/** What a Timeline row shows of its request, however it lays it out. */
export interface RowFigures {
  state: RequestState;
  /** `api.` — the source and its dot. */
  prefix: string;
  /** `orders.create` — the group and the endpoint. */
  name: string;
  /** The HTTP verb; a stream's is GET. */
  method: string;
  duration: DurationCell;
  /** When it began, as Settings asks: relative or a time of day. */
  time: string;
}

/**
 * What a Timeline row shows of its request: its state, name, method, how
 * long it took and when it began. A request still running, or a stream
 * still open, counts its time each second.
 *
 * @param r - The request
 * @param context - The time now, the slow threshold and how times are written
 * @returns The row's figures
 * @example
 * ```ts
 * const { method, name, duration, time } = useRowFigures(request, context);
 * ```
 */
export function useRowFigures(r: RequestEntry, context: RowContext): RowFigures {
  const state = requestStateOf(r);
  const pulse = context.endedAt === undefined && (state === "pending" || state === "streaming");
  const counting = useSecondNow(pulse);
  const { prefix, name } = endpointParts(r);
  return {
    state,
    prefix,
    name,
    method: isStreamRequest(r) ? "GET" : httpMethodOf(r),
    duration: durationOf(r, state, counting === null ? context : { ...context, now: counting }),
    time:
      context.timestamps === "relative"
        ? formatRelativeTime(r.startedAt, context.now)
        : formatAbsoluteTime(r.startedAt),
  };
}
