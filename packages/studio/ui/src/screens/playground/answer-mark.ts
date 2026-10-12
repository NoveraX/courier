import { requestStateOf } from "@/features/requests/request-state";
import type { RequestEntry } from "@/store/types";
import type { PlaygroundHistoryEntry } from "@/store/types-ui";

/** How a run's answer is marked beside the Response switch: its status, in its tone. */
export interface AnswerMark {
  text: string;
  tone: "ok" | "err" | "warn" | "brand" | "subtle";
}

/**
 * The mark a run's answer carries beside the Response switch, so it is
 * seen from the request: `···` while a call is in flight, then its status
 * code — amber when the answer broke the response schema, red from 400 —
 * or `ERR` when it failed without one; for a stream, `live` while it is
 * open, `closed` once it ended and `ERR` when it failed.
 *
 * @param entry - The run shown, if any
 * @param row - The request the run made, once the runtime reported it
 * @returns The mark, or `undefined` before anything is sent
 * @example
 * ```ts
 * answerMark({ ...entry, status: "success", statusCode: 201 }, undefined); // { text: "201", tone: "ok" }
 * ```
 */
export function answerMark(
  entry: PlaygroundHistoryEntry | null,
  row: RequestEntry | undefined,
): AnswerMark | undefined {
  if (!entry) return undefined;
  if (entry.transport) return streamMark(entry);
  if (entry.status === "pending") return { text: "···", tone: "warn" };
  const code = row?.statusCode ?? entry.statusCode;
  const text = code ? String(code) : entry.status === "error" ? "ERR" : "—";
  if (row && requestStateOf(row) === "validation_error") return { text, tone: "warn" };
  if ((code ?? 0) >= 400 || entry.status === "error") return { text, tone: "err" };
  return { text, tone: code ? "ok" : "subtle" };
}

function streamMark(entry: PlaygroundHistoryEntry): AnswerMark {
  if (entry.status === "error" || entry.streamStatus === "error")
    return { text: "ERR", tone: "err" };
  if (entry.streamStatus === "streaming") return { text: "live", tone: "brand" };
  if (entry.streamStatus === "complete") return { text: "closed", tone: "subtle" };
  return { text: "···", tone: "brand" };
}
