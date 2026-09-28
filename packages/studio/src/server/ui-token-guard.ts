/**
 * The page events that change something, and the check that the page
 * presented Studio's token for them.
 */

import type { Socket } from "socket.io";

import { isPlainObject } from "./is-plain-object";
import type { StudioToken } from "./studio-token";
import { TOKEN_REFUSAL } from "./token-guard";

/**
 * The events that change the log, the view every page shows, the mocks or
 * what the Playground sends. Every other event reads.
 */
export const WRITING_EVENTS: ReadonlySet<string> = new Set([
  "requests:clear",
  "view:live",
  "playground:exec",
  "playground:exec:cancel",
  "playground:write",
  "playground:history:save",
  "mock:command",
  "mock:managed",
]);

/**
 * Refuse every writing event of a page whose handshake did not present the
 * token, as `auth.token`. Each is answered with the refusal instead of run:
 * through its acknowledgement when it waits for one, as the end of its call
 * when it sends a Playground call — so the call stops waiting — and as
 * `studio:read-only` otherwise. The page still receives everything it shows.
 *
 * @param socket - The page's socket, just connected
 * @param token - The project's token
 * @example
 * ```ts
 * uiNamespace.on("connection", (socket) => {
 *   guardUiWrites(socket, token);
 * });
 * ```
 */
export function guardUiWrites(socket: Socket, token: StudioToken): void {
  const auth: unknown = socket.handshake.auth;
  if (token.matches(isPlainObject(auth) ? auth.token : undefined)) return;
  socket.use((packet, next) => {
    const [event] = packet;
    if (!WRITING_EVENTS.has(event)) {
      next();
      return;
    }
    const args: readonly unknown[] = packet.slice(1);
    const ack = args.at(-1);
    const first = args[0];
    const rid = isPlainObject(first) ? first.rid : undefined;
    if (typeof ack === "function") ack({ ok: false, error: TOKEN_REFUSAL });
    else if (event === "playground:exec" && typeof rid === "string") {
      socket.emit("playground:error", { rid, error: { message: TOKEN_REFUSAL } });
    } else socket.emit("studio:read-only", { event, error: TOKEN_REFUSAL });
  });
}
