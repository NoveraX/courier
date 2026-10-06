import type { ResponderSocket } from "./playground-responder";
import type { StudioMessageLimit } from "./studio-message-limit";

/**
 * The runtime's socket as the Playground responder sends on it: an answer
 * or a stream's message larger than Studio takes is sent as the call's
 * error instead, which Studio shows the page that made the call. Sent
 * whole, it closed the runtime's connection, and every call it served.
 *
 * @param socket - The runtime's socket to Studio
 * @param limit - The largest message Studio takes
 * @returns The socket the responder sends on
 * @example
 * ```ts
 * setupPlaygroundResponder(limitedResponderSocket(socket, limit), getSources);
 * ```
 */
export function limitedResponderSocket(
  socket: ResponderSocket,
  limit: StudioMessageLimit,
): ResponderSocket {
  return {
    on: (event, listener) => socket.on(event, listener),
    emit(event, payload) {
      const refusal = limit.refusal("This answer", payload);
      if (refusal === null) socket.emit(event, payload);
      else socket.emit("playground:error", { rid: ridOf(payload), error: { message: refusal } });
    },
  };
}

function ridOf(payload: unknown): unknown {
  return typeof payload === "object" && payload !== null ? Reflect.get(payload, "rid") : undefined;
}
