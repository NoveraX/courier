/**
 * The page events that change something, and the check that the page
 * presented Studio's token for them.
 */

import type { Socket } from "socket.io";

import { visitorAddress } from "./demo/visitor-address";
import { isPlainObject } from "./is-plain-object";
import { READ_ONLY_PAGES, TOKEN_PAGES } from "./live-events";
import type { StudioToken } from "./studio-token";
import { TOKEN_REFUSAL } from "./token-guard";

/**
 * The events that change the log, a mock's log, the view every page shows,
 * the mocks or what the Playground sends. Every other event reads.
 */
export const WRITING_EVENTS: ReadonlySet<string> = new Set([
  "requests:clear",
  "mock:logs:clear",
  "view:live",
  "playground:exec",
  "playground:exec:cancel",
  "playground:write",
  "playground:history:save",
  "mock:command",
  "mock:managed",
  "page:state:set",
  "requests:pin",
]);

/** What becomes of an event a page without the token sent: run, let go unanswered, or refused. */
export type VisitorDecision =
  | { kind: "run" }
  | { kind: "drop" }
  | { kind: "refuse"; reason: string };

/** A page without the token: its socket id, and the address its visitor is counted against. */
export interface VisitorPage {
  page: string;
  address: string;
}

/** What a page without the token may send. */
export interface VisitorPolicy {
  /**
   * Decide on an event a page without the token sent.
   *
   * @param visitor - The page's socket id, and its visitor's address
   * @param event - The event's name
   * @param args - Its arguments, the acknowledgement last when it waits for one
   * @returns Whether it runs, and why not when it is refused
   */
  decide(visitor: VisitorPage, event: string, args: readonly unknown[]): VisitorDecision;
  /** Forget what was counted for a page that left. */
  forget(pageId: string): void;
}

const RUN: VisitorDecision = { kind: "run" };
const REFUSED: VisitorDecision = { kind: "refuse", reason: TOKEN_REFUSAL };

/**
 * Studio's own rule for a page without the token: it reads, and every
 * writing event is refused.
 */
export const READ_ONLY_VISITORS: VisitorPolicy = {
  decide: (_visitor, event) => (WRITING_EVENTS.has(event) ? REFUSED : RUN),
  forget: () => {},
};

/**
 * Hold a page whose handshake did not present the token, as `auth.token`,
 * to the visitors' policy — by default, refuse every writing event. A
 * refused event is answered instead of run: through its acknowledgement
 * when it waits for one, as the end of its call when it sends a Playground
 * call — so the call stops waiting — and as `studio:read-only` otherwise.
 * The page still receives everything it shows, live traffic without its
 * credentials (see `emitLiveEvent`).
 *
 * @param socket - The page's socket, just connected
 * @param token - The project's token
 * @param visitors - What a page without the token may send
 * @returns Whether the page presented the token
 * @example
 * ```ts
 * uiNamespace.on("connection", (socket) => {
 *   const trusted = guardUiWrites(socket, token);
 * });
 * ```
 */
export function guardUiWrites(
  socket: Socket,
  token: StudioToken,
  visitors: VisitorPolicy = READ_ONLY_VISITORS,
): boolean {
  const auth: unknown = socket.handshake.auth;
  if (token.matches(isPlainObject(auth) ? auth.token : undefined)) {
    void socket.join(TOKEN_PAGES);
    return true;
  }
  void socket.join(READ_ONLY_PAGES);
  socket.on("disconnect", () => visitors.forget(socket.id));
  const { address: peer, headers } = socket.handshake;
  const visitor = {
    page: socket.id,
    address: visitorAddress({ peer, forwardedFor: headers["x-forwarded-for"] }),
  };
  socket.use((packet, next) => {
    const [event] = packet;
    const args: readonly unknown[] = packet.slice(1);
    const decision = visitors.decide(visitor, event, args);
    if (decision.kind === "run") next();
    else if (decision.kind === "refuse") refuse(socket, event, args, decision.reason);
  });
  return false;
}

function refuse(socket: Socket, event: string, args: readonly unknown[], reason: string): void {
  const ack = args.at(-1);
  const first = args[0];
  const rid = isPlainObject(first) ? first.rid : undefined;
  if (typeof ack === "function") ack({ ok: false, error: reason });
  else if (event === "playground:exec" && typeof rid === "string") {
    socket.emit("playground:error", { rid, error: { message: reason } });
  } else socket.emit("studio:read-only", { event, error: reason });
}
