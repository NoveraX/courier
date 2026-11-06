import { createLogger } from "@noverax/courier";

import {
  type InFlight,
  type InFlightEntry,
  type PlaygroundAnswer,
  settle,
  tellEach,
} from "./playground-in-flight";

const log = createLogger("Studio");

/**
 * Hard ceiling on HTTP playground request lifetime. A runtime that silently
 * hangs returns a visible `playground:error` instead of a spinning UI
 * forever, and is told to stop the call. SSE and WS requests are NOT timed
 * out at this layer: their natural lifetime is bounded by the user's
 * Unsubscribe action, the runtime responder's `AbortSignal`, or the runtime
 * socket disconnect.
 */
export const HTTP_TIMEOUT_MS = 30_000;

/**
 * The error a run ends with for its sender when the router ends it.
 *
 * @param rid - The run's id
 * @param message - Why it ended
 * @returns The answer to hand its sender
 * @example
 * ```ts
 * entry.deliver(failedAnswer(rid, "Runtime disconnected mid-request"));
 * ```
 */
export function failedAnswer(rid: string, message: string): PlaygroundAnswer {
  return { event: "playground:error", payload: { rid, error: { message } } };
}

/**
 * Tell the runtime serving a run to stop it. A socket that cannot take the
 * word is logged, and the run is over for Studio all the same.
 *
 * @param rid - The run's id
 * @param entry - The run, settled already
 * @param why - What stopping it is for, for the log
 * @example
 * ```ts
 * stopAtRuntime(rid, entry, "cancel at the runtime");
 * ```
 */
export function stopAtRuntime(rid: string, entry: InFlightEntry, why: string): void {
  tellEach([[rid, entry]], why, () => entry.runtimeSocket.emit("playground:cancel", { rid }));
}

/**
 * End a run its sender cancelled, the moment it is cancelled: the run is
 * settled, the runtime is told to stop it, and the sender is handed an end
 * that says it was cancelled — what the runtime sends for it afterwards
 * finds no run to go to.
 *
 * @param inFlight - The requests in flight
 * @param rid - The run's id
 * @param entry - The run, as its sender sent it
 * @example
 * ```ts
 * const entry = sentBy(uiSocket, rid);
 * if (entry) endCancelled(inFlight, rid, entry);
 * ```
 */
export function endCancelled(inFlight: InFlight, rid: string, entry: InFlightEntry): void {
  settle(inFlight, rid);
  stopAtRuntime(rid, entry, "cancel at the runtime");
  entry.deliver({
    event: "playground:end",
    payload: { rid, summary: { durationMs: performance.now() - entry.sentAt, cancelled: true } },
  });
}

/**
 * Arm an HTTP run's timeout: past it, the run ends for its sender with an
 * error, and the runtime is told to stop it.
 *
 * @param inFlight - The requests in flight
 * @param rid - The run's id
 * @param entry - The run, which keeps the timer until it settles
 * @example
 * ```ts
 * if (payload.transport === "http") armTimeout(inFlight, payload.rid, entry);
 * ```
 */
export function armTimeout(inFlight: InFlight, rid: string, entry: InFlightEntry): void {
  entry.timeout = setTimeout(() => {
    if (inFlight.get(rid) !== entry) return;
    log.warn(
      `playground:exec timeout after ${HTTP_TIMEOUT_MS}ms — rid=${rid} runtime=${entry.runtimeId}`,
    );
    settle(inFlight, rid);
    stopAtRuntime(rid, entry, "stop the call that timed out");
    entry.deliver(failedAnswer(rid, `Runtime did not respond within ${HTTP_TIMEOUT_MS / 1000}s`));
  }, HTTP_TIMEOUT_MS);
}
