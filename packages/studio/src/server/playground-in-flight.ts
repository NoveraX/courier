import { createLogger } from "@noverax/courier";
import type { Socket } from "socket.io";

const log = createLogger("Studio");

/** A playground request a runtime is serving. */
export interface InFlightEntry {
  runtimeId: string;
  /**
   * The runtime socket the request went to. Several processes may share a
   * runtime id; only this one answers the request, and its disconnect ends it.
   */
  runtimeSocket: Socket;
  uiSocketId: string;
  transport: "http" | "sse" | "ws";
  /** Armed for HTTP requests only — cleared on terminal event or cancel. */
  timeout?: NodeJS.Timeout;
}

/** The requests in flight, by rid. */
export type InFlight = Map<string, InFlightEntry>;

/**
 * Stop tracking a request: its entry goes, and its timeout with it.
 *
 * @param inFlight - The requests in flight
 * @param rid - The request's id
 * @returns Its entry, if it was in flight
 * @example
 * ```ts
 * const entry = settle(inFlight, payload.rid);
 * ```
 */
export function settle(inFlight: InFlight, rid: string): InFlightEntry | undefined {
  const entry = inFlight.get(rid);
  if (entry === undefined) return undefined;
  if (entry.timeout) clearTimeout(entry.timeout);
  inFlight.delete(rid);
  return entry;
}

/**
 * Stop tracking every request an entry matches, and hand them over.
 *
 * @param inFlight - The requests in flight
 * @param matches - Which entries to take
 * @returns The requests taken, with their rids
 * @example
 * ```ts
 * for (const [rid, entry] of settleWhere(inFlight, (e) => e.uiSocketId === id)) cancel(rid, entry);
 * ```
 */
export function settleWhere(
  inFlight: InFlight,
  matches: (entry: InFlightEntry) => boolean,
): Array<[string, InFlightEntry]> {
  const taken = [...inFlight].filter(([, entry]) => matches(entry));
  for (const [rid] of taken) settle(inFlight, rid);
  return taken;
}

/**
 * Tell the other end of each settled request, one at a time. A send that
 * throws is logged, and the rest are still told.
 *
 * @param settled - The requests settled, with their rids
 * @param what - What telling does, for the log
 * @param tell - Tells one request's other end
 * @example
 * ```ts
 * tellEach(sent, "cancel on the UI's disconnect", (rid, e) => e.runtimeSocket.emit("playground:cancel", { rid }));
 * ```
 */
export function tellEach(
  settled: ReadonlyArray<[string, InFlightEntry]>,
  what: string,
  tell: (rid: string, entry: InFlightEntry) => void,
): void {
  for (const [rid, entry] of settled) {
    try {
      tell(rid, entry);
    } catch (err) {
      log.warn(`Failed to ${what} for rid ${rid}`, err);
    }
  }
}
