import type { BodyPart, KeptBodies } from "@noverax/courier/internal";
import type { Socket } from "socket.io-client";

type BodyAnswer = { ok: true; data: string } | { ok: false; error: string };

function partOf(value: unknown): BodyPart | undefined {
  return value === "request" || value === "response" ? value : undefined;
}

function answerFor(bodies: KeptBodies, asked: unknown): BodyAnswer {
  if (typeof asked !== "object" || asked === null) {
    return { ok: false, error: "Studio asked for a body without naming the request." };
  }
  const requestId: unknown = Reflect.get(asked, "requestId");
  const part = partOf(Reflect.get(asked, "part"));
  if (typeof requestId !== "string" || part === undefined) {
    return {
      ok: false,
      error: "Studio asked for a body without naming the request and which body.",
    };
  }
  const text = bodies.textOf(requestId, part);
  if (text !== undefined) return { ok: true, data: text };
  return {
    ok: false,
    error: `The app no longer keeps this request's whole ${part} body: it keeps those of its latest requests only.`,
  };
}

/**
 * Answer Studio's `runtime:body`: the whole body of one of this app's
 * latest requests, as JSON, when the request's event carried only a part of
 * it — a page downloads it, or replays the request with it.
 *
 * The listener goes with the socket's others when the runtime detaches.
 *
 * @param socket - The runtime's socket to Studio
 * @param bodies - The bodies the runtime keeps whole
 * @example
 * ```ts
 * answerBodyRequests(socket, bodies);
 * // Studio: runtimeSocket.emit("runtime:body", { requestId, part: "response" }, (answer) => …)
 * ```
 */
export function answerBodyRequests(socket: Socket, bodies: KeptBodies): void {
  socket.on("runtime:body", (asked: unknown, answer: unknown): void => {
    if (typeof answer === "function") answer(answerFor(bodies, asked));
  });
}
