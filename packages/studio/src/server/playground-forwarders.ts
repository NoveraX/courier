import {
  type InFlight,
  type InFlightEntry,
  type PlaygroundAnswer,
  settle,
} from "./playground-in-flight";
import { sanitizeChunk, sanitizeEnd, sanitizeError } from "./runtime-playground-chunk-sanitize";

/** What a runtime sends back for a playground request, forwarded to the UI that asked. */
export interface PlaygroundForwarders {
  forwardChunk(raw: unknown, runtimeSocketId: string): void;
  forwardEnd(raw: unknown, runtimeSocketId: string): void;
  forwardError(raw: unknown, runtimeSocketId: string): void;
}

/**
 * Forward a runtime's answers to whoever sent each request — the page that
 * asked, or Studio itself. A payload is sanitized, and taken only from the
 * runtime socket the request went to: another process under the same
 * runtime id has no say in it. An end or an error settles the request.
 *
 * @param inFlight - The requests in flight
 * @returns The forwarders
 * @example
 * ```ts
 * socket.on("playground:chunk", (raw) => forwarders.forwardChunk(raw, socket.id));
 * ```
 */
export function createPlaygroundForwarders(inFlight: InFlight): PlaygroundForwarders {
  const ownedBy = (rid: string, runtimeSocketId: string): InFlightEntry | undefined => {
    const entry = inFlight.get(rid);
    return entry?.runtimeSocket.id === runtimeSocketId ? entry : undefined;
  };
  const forward = (answer: PlaygroundAnswer, runtimeSocketId: string): void => {
    const { rid } = answer.payload;
    const entry = ownedBy(rid, runtimeSocketId);
    if (!entry) return;
    /* Settled before it is handed on, so a sender that throws does not leave it in flight. */
    if (answer.event !== "playground:chunk") settle(inFlight, rid);
    entry.deliver(answer);
  };

  return {
    forwardChunk: (raw, runtimeSocketId) => {
      const payload = sanitizeChunk(raw);
      if (payload) forward({ event: "playground:chunk", payload }, runtimeSocketId);
    },
    forwardEnd: (raw, runtimeSocketId) => {
      const payload = sanitizeEnd(raw);
      if (payload) forward({ event: "playground:end", payload }, runtimeSocketId);
    },
    forwardError: (raw, runtimeSocketId) => {
      const payload = sanitizeError(raw);
      if (payload) forward({ event: "playground:error", payload }, runtimeSocketId);
    },
  };
}
