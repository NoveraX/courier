import type { Namespace } from "socket.io";
import { type InFlight, type InFlightEntry, settle } from "./playground-in-flight";
import { sanitizeChunk, sanitizeEnd, sanitizeError } from "./runtime-playground-chunk-sanitize";

/** What a runtime sends back for a playground request, forwarded to the UI that asked. */
export interface PlaygroundForwarders {
  forwardChunk(raw: unknown, runtimeSocketId: string): void;
  forwardEnd(raw: unknown, runtimeSocketId: string): void;
  forwardError(raw: unknown, runtimeSocketId: string): void;
}

/**
 * Forward a runtime's answers to the UI socket that sent each request. A
 * payload is sanitized, and taken only from the runtime socket the request
 * went to: another process under the same runtime id has no say in it. An
 * end or an error settles the request.
 *
 * @param inFlight - The requests in flight
 * @param uiNamespace - Where the UI sockets are
 * @returns The forwarders
 * @example
 * ```ts
 * socket.on("playground:chunk", (raw) => forwarders.forwardChunk(raw, socket.id));
 * ```
 */
export function createPlaygroundForwarders(
  inFlight: InFlight,
  uiNamespace: Namespace,
): PlaygroundForwarders {
  const ownedBy = (rid: string, runtimeSocketId: string): InFlightEntry | undefined => {
    const entry = inFlight.get(rid);
    return entry?.runtimeSocket.id === runtimeSocketId ? entry : undefined;
  };
  const forward = (event: string, payload: { rid: string }, runtimeSocketId: string): void => {
    const entry = ownedBy(payload.rid, runtimeSocketId);
    if (!entry) return;
    uiNamespace.to(entry.uiSocketId).emit(event, payload);
    if (event !== "playground:chunk") settle(inFlight, payload.rid);
  };

  return {
    forwardChunk: (raw, runtimeSocketId) => {
      const payload = sanitizeChunk(raw);
      if (payload) forward("playground:chunk", payload, runtimeSocketId);
    },
    forwardEnd: (raw, runtimeSocketId) => {
      const payload = sanitizeEnd(raw);
      if (payload) forward("playground:end", payload, runtimeSocketId);
    },
    forwardError: (raw, runtimeSocketId) => {
      const payload = sanitizeError(raw);
      if (payload) forward("playground:error", payload, runtimeSocketId);
    },
  };
}
