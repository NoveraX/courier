import type { RequestEntry } from "@/store/types";

/** Where a request stands, as the Timeline and the inspector show it. */
export type RequestState =
  | "pending"
  | "success"
  | "error"
  | "aborted"
  | "validation_error"
  | "streaming"
  | "closed";

/** The colour a state is told in. */
export type StateTone = "ok" | "warn" | "err" | "brand" | "muted";

/** How each state is named and coloured. */
export const STATE_META: Readonly<Record<RequestState, { label: string; tone: StateTone }>> = {
  success: { label: "Success", tone: "ok" },
  error: { label: "Error", tone: "err" },
  validation_error: { label: "Validation", tone: "warn" },
  pending: { label: "Pending", tone: "warn" },
  aborted: { label: "Aborted", tone: "muted" },
  streaming: { label: "Streaming", tone: "brand" },
  closed: { label: "Closed", tone: "ok" },
};

/**
 * Whether a request is a stream: Server-Sent Events or a WebSocket.
 *
 * @param r - The request
 * @returns Whether it streams
 * @example
 * ```ts
 * isStreamRequest({ transport: "sse" }); // true
 * ```
 */
export function isStreamRequest(r: Pick<RequestEntry, "transport">): boolean {
  return r.transport === "sse" || r.transport === "ws";
}

/**
 * Where a request stands: a stream is streaming until it closes or fails,
 * any other request is in its own status.
 *
 * @param r - The request
 * @returns Its state
 * @example
 * ```ts
 * requestStateOf({ transport: "ws", streamStatus: "complete", status: "success" }); // "closed"
 * ```
 */
export function requestStateOf(
  r: Pick<RequestEntry, "transport" | "streamStatus" | "status">,
): RequestState {
  if (!isStreamRequest(r)) return r.status;
  if (r.streamStatus === "error") return "error";
  return r.streamStatus === "complete" ? "closed" : "streaming";
}

/**
 * Whether a request failed: an error, or a response that broke its schema.
 *
 * @param state - The request's state
 * @returns Whether it failed
 * @example
 * ```ts
 * isFailedState("validation_error"); // true
 * ```
 */
export function isFailedState(state: RequestState): boolean {
  return state === "error" || state === "validation_error";
}
