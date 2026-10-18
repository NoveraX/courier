import type { RequestEntry, StreamCloseReason } from "@/store/types";

const CLOSED_BY: Readonly<Record<StreamCloseReason, string>> = {
  complete: "Closed by the server",
  disconnect: "Closed by the caller",
  shutdown: "Closed as the server shut down",
  max_lifetime: "Closed when its lifetime ran out",
  slow_consumer: "Closed for reading too slowly",
  error: "Closed with an error",
};

/* A close nothing went wrong in: the server finished it, its caller left, or its lifetime ran out. */
const ORDINARY: ReadonlySet<StreamCloseReason> = new Set([
  "complete",
  "disconnect",
  "max_lifetime",
]);

/**
 * Who or what closed an ended stream, as its runtime said it, in words:
 * `Closed by the caller` for a stream the code that followed it closed;
 * `Closed` alone for one whose runtime said no more.
 *
 * @param r - The ended stream
 * @returns The words
 * @example
 * ```ts
 * closedBy({ streamCloseReason: "disconnect" }); // "Closed by the caller"
 * ```
 */
export function closedBy(r: Pick<RequestEntry, "streamCloseReason">): string {
  return r.streamCloseReason === undefined ? "Closed" : CLOSED_BY[r.streamCloseReason];
}

/**
 * Whether an ended stream closed the way streams do: its server finished
 * it, its caller left, or its lifetime ran out — not as its server shut
 * down, or for reading too slowly.
 *
 * @param r - The ended stream
 * @returns Whether its close was an ordinary one
 */
export function closedOrdinarily(r: Pick<RequestEntry, "streamCloseReason">): boolean {
  return r.streamCloseReason === undefined || ORDINARY.has(r.streamCloseReason);
}
