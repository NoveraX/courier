/**
 * The protocol's codes, by name: what a close carries, and what an
 * `auth_error`, a `disconnect` or an `error` frame names. The wire carries
 * the numbers; the server, a mock of it and the client name them from
 * here. Those of 4400 and up follow the HTTP statuses of the same meaning.
 */
export const WS_CODE = {
  /** Closed by the application with no code of its own, or by the client itself */
  NORMAL: 1000,
  /** The server is stopping; `retryAfterMs` says when to come back */
  GOING_AWAY: 1001,
  /** The protocol versions differ: `auth_error.v` names the server's */
  PROTOCOL_MISMATCH: 1002,
  /** Data the server does not take, as a proxy or `ws` says */
  UNSUPPORTED_DATA: 1003,
  /** A text frame that is no UTF-8 */
  INVALID_PAYLOAD: 1007,
  /** A policy of the server's, as a proxy or `ws` says */
  POLICY_VIOLATION: 1008,
  /** A frame larger than the server reads */
  MESSAGE_TOO_BIG: 1009,
  /** The server failed, or could not admit the connection in time */
  INTERNAL_ERROR: 1011,
  /** The socket's buffer overflowed: a slow consumer, to resume with `since` */
  TRY_AGAIN_LATER: 1013,
  /** The first of the codes an application closes with, `connections.disconnect(…, { code })` */
  APPLICATION_FIRST: 4000,
  /** The last of them */
  APPLICATION_LAST: 4099,
  /** A frame the protocol does not take: malformed, missing what it needs, or sent where none is heard */
  BAD_REQUEST: 4400,
  /** Credentials refused, expired, or not renewed in time */
  UNAUTHORIZED: 4401,
  /** Forbidden: an origin, a `ForbiddenError`, a subscription or a message refused */
  FORBIDDEN: 4403,
  /** What a frame names is not there: a subscription, a channel */
  NOT_FOUND: 4404,
  /** No first frame in time, or no answer to the heartbeat */
  TIMEOUT: 4408,
  /** Given up for a newer connection of its key */
  REPLACED: 4409,
  /** A message larger than the server takes */
  TOO_LARGE: 4413,
  /** A host the server does not serve */
  HOST_NOT_ALLOWED: 4421,
  /** A payload or variables their schema refuses */
  VALIDATION_FAILED: 4422,
  /** Over a limit: an address's connections, a key's, frames, subscriptions */
  TOO_MANY: 4429,
} as const;
