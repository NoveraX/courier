import type { ResponderSocket } from "./playground-responder";

/**
 * The socket one Playground run answers through, silent once the run is
 * cancelled. Studio's router ends a cancelled run for the page itself, so
 * whatever the runtime would say of it afterwards — the failure of the
 * aborted call, a stream's end, a message its channel refused — is said to
 * nobody, and is not said.
 *
 * @param socket - The runtime's socket to Studio
 * @param signal - The run's signal, aborted when it is cancelled
 * @returns The socket the run answers through
 * @example
 * ```ts
 * const told = quietOnceCancelled(socket, ac.signal);
 * ```
 */
export function quietOnceCancelled(socket: ResponderSocket, signal: AbortSignal): ResponderSocket {
  return {
    on: (event, listener) => socket.on(event, listener),
    emit: (event, payload) => {
      if (!signal.aborted) socket.emit(event, payload);
    },
  };
}
