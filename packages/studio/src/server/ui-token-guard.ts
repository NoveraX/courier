/**
 * The page events a page may send without Studio's token, and the check
 * that the page presented the token for every other one.
 */

import type { Socket } from "socket.io";

import type { TrustedProxies } from "./demo/trusted-proxies";
import { visitorAddress } from "./demo/visitor-address";
import { isPlainObject } from "./is-plain-object";
import { READ_ONLY_PAGES, TOKEN_PAGES } from "./live-events";
import type { StudioToken } from "./studio-token";
import { TOKEN_REFUSAL } from "./token-guard";

/**
 * The events a page without the token may send: each reads what Studio
 * shows — a request's whole body, which its event carried only a part of,
 * and a mock's records. Every other event asks for the token: those that
 * change the log, a mock's log, the view every page shows, the pins, what
 * the pages keep, the mocks or what the Playground sends. An event added
 * and not listed here asks for the token too, so forgetting to list one
 * refuses a reader instead of letting a writer through.
 */
export const READING_EVENTS: ReadonlySet<string> = new Set([
  "request:body",
  "mock:body",
  "mock:store:get",
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
  /** The proxies a visitor's address is read past in `X-Forwarded-For`; none unless the demo names them. */
  readonly trusted?: TrustedProxies | undefined;
}

const RUN: VisitorDecision = { kind: "run" };
const REFUSED: VisitorDecision = { kind: "refuse", reason: TOKEN_REFUSAL };

/**
 * Studio's own rule for a page without the token: it reads, and every event
 * but the {@link READING_EVENTS} is refused.
 */
export const READ_ONLY_VISITORS: VisitorPolicy = {
  decide: (_visitor, event) => (READING_EVENTS.has(event) ? RUN : REFUSED),
  forget: () => {},
};

/**
 * Hold a page whose handshake did not present the token, as `auth.token`,
 * to the visitors' policy — by default, refuse every event but those that
 * read what Studio shows. A refused event is answered instead of run:
 * through its acknowledgement when it waits for one, as the end of its call
 * when it sends a Playground call — so the call stops waiting — and as
 * `studio:read-only` otherwise.
 * The page still receives everything it shows, live traffic without its
 * credentials (see `emitLiveEvents`).
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
    address: visitorAddress({ peer, headers }, visitors.trusted),
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
