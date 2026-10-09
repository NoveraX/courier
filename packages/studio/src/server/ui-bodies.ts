import type { Socket } from "socket.io";

import { isPlainObject } from "./is-plain-object";
import type { CommandReply } from "./mock-manager/command-replies";
import { runtimeRegistry } from "./runtime-namespace-state";
import type { SanitizedMockCommand } from "./sanitize-mock-events";

/* Long enough for an app to send a body of tens of megabytes. */
const RUNTIME_TIMEOUT_MS = 10_000;

/** A request's whole body as JSON, or why there is none. */
export type BodyAnswer = { ok: true; data: string } | { ok: false; error: string };

/** Which body is asked for: of which request, made or answered by whom. */
export interface Asked {
  readonly owner: string;
  readonly requestId: string;
  readonly part: "request" | "response";
}

/* What a page asked for: the mock or app that made the request, the request, and which body. */
function askedOf(raw: unknown, ownerKey: "serverId" | "sessionId"): Asked | undefined {
  if (!isPlainObject(raw)) return undefined;
  const { [ownerKey]: owner, requestId, part } = raw;
  if (typeof owner !== "string" || typeof requestId !== "string") return undefined;
  return part === "request" || part === "response" ? { owner, requestId, part } : undefined;
}

function bodyAnswerOf(reply: unknown): BodyAnswer {
  if (isPlainObject(reply) && reply.ok === true && typeof reply.data === "string") {
    return { ok: true, data: reply.data };
  }
  const error = isPlainObject(reply) && typeof reply.error === "string" ? reply.error : undefined;
  return { ok: false, error: error ?? "The body did not come back." };
}

function answer(ack: unknown, body: BodyAnswer): void {
  if (typeof ack === "function") ack(body);
}

/**
 * A request's whole body, asked of the runtime that made it, which keeps
 * its latest bodies whole: what a replay sends again when the request's
 * event carried only a part of its variables.
 *
 * @param asked - The runtime's session, the request, and which body
 * @returns The body as JSON, or why there is none
 * @example
 * ```ts
 * const body = await wholeBodyOf({ owner: r.sessionId, requestId: r.id, part: "request" });
 * ```
 */
export function wholeBodyOf({ owner, requestId, part }: Asked): Promise<BodyAnswer> {
  const runtime = runtimeRegistry.get(owner)?.socket;
  if (!runtime?.connected) {
    return Promise.resolve({
      ok: false,
      error: "The app that made this request is not attached to Studio now.",
    });
  }
  return new Promise((resolve) => {
    runtime
      .timeout(RUNTIME_TIMEOUT_MS)
      .emit("runtime:body", { requestId, part }, (error: Error | null, reply: unknown) => {
        resolve(
          error ? { ok: false, error: "The app did not send the body." } : bodyAnswerOf(reply),
        );
      });
  });
}

/**
 * Answer a page that asks for a request's whole body, which its event
 * carried only a part of: `mock:body` asks the mock that answered it,
 * `request:body` the app that made it. Each only reads, so a page without
 * the token may ask too.
 *
 * @param socket - The page's socket
 * @param askMock - Sends a command to the mock it names; `undefined` when Studio has no such mock
 * @example
 * ```ts
 * bindBodies(socket, (command) => mockManager?.forwardStoreCommand(command));
 * // page: socket.emit("mock:body", { serverId, requestId, part: "response" }, (answer) => …)
 * ```
 */
export function bindBodies(
  socket: Socket,
  askMock: (command: SanitizedMockCommand) => Promise<CommandReply> | undefined,
): void {
  socket.on("mock:body", async (raw: unknown, ack?: unknown) => {
    const asked = askedOf(raw, "serverId");
    if (!asked)
      return answer(ack, { ok: false, error: "Studio could not read which body to send." });
    const { owner: serverId, requestId, part } = asked;
    const reply = askMock({ action: "mock:request:body", serverId, requestId, part });
    if (!reply) return answer(ack, { ok: false, error: `No mock is named "${serverId}".` });
    answer(ack, bodyAnswerOf(await reply));
  });
  socket.on("request:body", async (raw: unknown, ack?: unknown) => {
    const asked = askedOf(raw, "sessionId");
    if (!asked)
      return answer(ack, { ok: false, error: "Studio could not read which body to send." });
    answer(ack, await wholeBodyOf(asked));
  });
}
