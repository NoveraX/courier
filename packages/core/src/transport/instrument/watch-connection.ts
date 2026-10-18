import { type ConnectionRetry, retryOf } from "../../realtime/retry-of";
import type { ConnectionStatus } from "../../realtime/types";
import type { StreamStatusEvent } from "../../studio/hooks-stream";

/** What reports a status, as a subscription and a channel do. */
interface StatusSource {
  readonly status: ConnectionStatus;
  on(event: "status", handler: (status: ConnectionStatus) => void): () => void;
}

/** What a stream that is being opened again is told with. */
export interface Reconnect {
  /** What the client saw of the last connection */
  retry: ConnectionRetry | undefined;
  /** Whether a connection of the stream has opened before */
  openedBefore: boolean;
}

/** Tells Studio how a stream's connection stands, and why the last one ended. */
export type StatusTeller = (status: StreamStatusEvent["status"], reconnect?: Reconnect) => void;

/**
 * Tell how the connection of a subscription or channel stands as it
 * changes: being opened, until it first opens; open, each time it does;
 * being opened again, each time one ends, with why. Attempts in between go
 * untold: the stream stands reconnecting until one opens.
 *
 * @param source - The subscription or channel
 * @param tell - What hears it
 * @returns What stops the watch
 * @example
 * ```ts
 * const unwatch = watchConnection(subscription, instr.emitStatus);
 * ```
 */
export function watchConnection(source: StatusSource, tell: StatusTeller): () => void {
  let opened = source.status === "connected";
  if (!opened) tell("connecting");
  return source.on("status", (status) => {
    if (status === "connected") {
      opened = true;
      tell("open");
    } else if (status === "reconnecting") {
      tell("reconnecting", { retry: retryOf(source), openedBefore: opened });
    }
  });
}
