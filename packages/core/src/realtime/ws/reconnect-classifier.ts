import { CLIENT_LIMITS } from "../client-limits";
import { AuthError, fromErrorCode, type RealtimeError } from "../errors";
import { PROTOCOL_VERSION } from "./ws-protocol";

/** The close code of a socket closed over a frame larger than the server reads. */
export const MESSAGE_TOO_BIG = 1009;

/**
 * How a socket closed, as the client read it: from the frame a server sent
 * to announce the close, where one came — a balancer can lose a close frame,
 * and the frame before it gets through — or from the socket's close event.
 */
export interface SocketClosure {
  readonly code: number;
  readonly reason: string;
  /** How long the server asked the client to wait before connecting again */
  readonly retryAfterMs?: number | undefined;
  /** The protocol the server speaks, as its `auth_error` said */
  readonly version?: number | undefined;
}

/** What a closed socket means for its connection. */
export type CloseDisposition =
  /** Reconnect after the backoff, or not sooner than the server asked */
  | { readonly action: "retry"; readonly afterMs?: number | undefined }
  /** The server refused the credentials: they are asked for anew, once */
  | { readonly action: "reauthenticate"; readonly error: AuthError }
  /** Refused for good: reconnecting would only meet the same answer */
  | { readonly action: "stop"; readonly error: RealtimeError }
  /** The server ended the connection, and nothing went wrong */
  | { readonly action: "finish" };

/*
 * Codes a reconnect cannot change: data or a policy the server will not
 * take, an origin or host it refuses, a connection replaced by a newer one
 * of the same user — reconnecting would replace that one in turn.
 */
const FINAL: ReadonlySet<number> = new Set([1003, 1007, 1008, 4400, 4403, 4409, 4421]);

/**
 * Read a socket's close against the protocol's table of codes.
 *
 * - 1000: the server ended the connection; it is not reopened.
 * - 1002: the two ends speak different versions of the protocol. A server
 *   older than the client is a replica a rollout replaces, and is tried
 *   again; a newer one needs a newer client — the page loaded again — and
 *   one of the client's own version refused a broken first frame.
 * - 4401: credentials refused, expired or not renewed in time — asked for
 *   anew once, and sent only if they changed.
 * - 4429: a limit; with the server's `retryAfterMs`, tried again after it,
 *   and without one, given up.
 * - 4000–4099, and the codes above that no reconnect changes: given up.
 * - Anything else — a dropped network, a server going away (1001, 1012), a
 *   slow consumer (1013), a timeout (4408) — reconnects, after the server's
 *   `retryAfterMs` when it gave one.
 *
 * @param closure - How the socket closed
 * @returns What the connection does next
 * @example
 * ```ts
 * classifyClose({ code: 1006, reason: "" }); // → { action: "retry" }
 * classifyClose({ code: 4409, reason: "Replaced by a newer connection" }).action; // → "stop"
 * ```
 */
export function classifyClose(closure: SocketClosure): CloseDisposition {
  const { code } = closure;
  if (code === 1000) return { action: "finish" };
  if (code === 4401) {
    return {
      action: "reauthenticate",
      error: new AuthError(closure.reason || "Credentials rejected"),
    };
  }
  const afterMs = hintOf(closure.retryAfterMs);
  const olderServer = closure.version !== undefined && closure.version < PROTOCOL_VERSION;
  if (code === 1002 && !olderServer) return stop(closure);
  if (code === 4429 && afterMs === undefined) return stop(closure);
  if (FINAL.has(code) || (code >= 4000 && code <= 4099)) return stop(closure);
  return afterMs === undefined ? { action: "retry" } : { action: "retry", afterMs };
}

function stop(closure: SocketClosure): CloseDisposition {
  return {
    action: "stop",
    error: fromErrorCode(closure.code, closure.reason || "Connection closed"),
  };
}

/* A wait the server asked for, held to what a client waits at most: a
   server cannot park a client for good by asking for too long a wait. */
function hintOf(retryAfterMs: number | undefined): number | undefined {
  if (retryAfterMs === undefined || !Number.isFinite(retryAfterMs) || retryAfterMs < 0) {
    return undefined;
  }
  return Math.min(retryAfterMs, CLIENT_LIMITS.RECONNECT_MAX_HINT_MS);
}
