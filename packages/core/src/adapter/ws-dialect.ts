import type { StreamFailure } from "../realtime/describe-failure";
import type { WSMessage } from "../realtime/ws/ws-protocol";

/**
 * Why the server closes a connection, as the connection's code and its
 * frames are worked out from: a dialect of the protocol says it in its own
 * codes, so the closing code itself never names one.
 */
export type SessionClose =
  | { readonly kind: "host" }
  | { readonly kind: "origin" }
  | { readonly kind: "limit" }
  | { readonly kind: "flood" }
  | { readonly kind: "auth-refused"; readonly failure: StreamFailure }
  | { readonly kind: "admission-timeout" }
  | { readonly kind: "reauth-refused"; readonly failure: StreamFailure }
  | { readonly kind: "reauth-timeout" }
  | { readonly kind: "heartbeat-timeout" }
  | { readonly kind: "slow-consumer" }
  | { readonly kind: "internal" }
  | { readonly kind: "application"; readonly code: number; readonly reason: string };

/** A close as the socket sends it. */
export interface CloseFrame {
  readonly code: number;
  readonly reason: string;
}

/** A version of the protocol, as a connection's frames and codes speak it. */
export interface WireDialect {
  readonly version: 1;
  /** The code and reason a connection is closed with, for why it is */
  closeOf(why: SessionClose): CloseFrame;
  /** The frame that asks the client for its credentials again */
  reauthRequest(timeoutMs: number): WSMessage;
  /** The frame that tells the client its credentials sent again were taken */
  reauthAccepted(id: string | undefined): WSMessage;
}

/**
 * Whether a server may close a connection with a code: one RFC 6455
 * defines for an endpoint to send — 1000 to 1014 but 1004, 1005 and 1006,
 * which no endpoint sends — or one of 3000–4999, left to libraries and
 * applications. A socket refuses to send any other.
 *
 * @param code - The code
 * @returns Whether it may be sent
 * @example
 * ```ts
 * isSendableCloseCode(4001); // true
 * isSendableCloseCode(1012); // true, a restart
 * isSendableCloseCode(1006); // false
 * ```
 */
export function isSendableCloseCode(code: number): boolean {
  if (!Number.isInteger(code)) return false;
  if (code >= 3000 && code <= 4999) return true;
  return code >= 1000 && code <= 1014 && code !== 1004 && code !== 1005 && code !== 1006;
}

/* A refusal's own code where a close can carry it — a `RealtimeError` the
   hook threw on purpose, `ForbiddenError` (4403) — and 4401 otherwise. */
function refused(failure: StreamFailure, fallback: string): CloseFrame {
  const own = failure.code >= 4000 && failure.code <= 4999;
  return own ? { code: failure.code, reason: failure.message } : { code: 4401, reason: fallback };
}

/**
 * Protocol v1: what every Courier client up to 0.4 speaks, and what a
 * socket speaks when its first frame does not name a later version. No
 * frame tells the client why it was closed; the code and the reason do.
 */
export const V1_DIALECT: WireDialect = {
  version: 1,
  closeOf(why) {
    switch (why.kind) {
      case "host":
        return { code: 4421, reason: "Host not allowed" };
      case "origin":
        return { code: 4403, reason: "Origin not allowed" };
      case "limit":
        return { code: 4429, reason: "Too many connections" };
      case "flood":
        return { code: 4429, reason: "Too many messages before the connection was accepted" };
      case "auth-refused":
        return refused(why.failure, "Connection rejected");
      case "admission-timeout":
        return { code: 1011, reason: "Connection could not be admitted in time" };
      case "reauth-refused":
        return refused(why.failure, "Credentials rejected");
      case "reauth-timeout":
        return { code: 4401, reason: "Auth timeout — credentials not sent again" };
      case "heartbeat-timeout":
        return { code: 4408, reason: "Heartbeat timeout" };
      case "slow-consumer":
        return { code: 4008, reason: "Slow consumer" };
      case "internal":
        return { code: 1011, reason: "Internal error" };
      case "application":
        return { code: why.code, reason: why.reason };
    }
  },
  reauthRequest: () => ({ type: "auth_required" }),
  reauthAccepted: (id) => ({ type: "auth", id }),
};
