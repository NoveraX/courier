import { createLogger } from "../logger";
import type { WSAuthParams } from "../realtime/ws/ws-credentials";
import { isFieldRecord } from "../utils/body-kind";
import { peerAddressOf, rememberPeerAddress } from "./peer-address";

const log = createLogger("WS");

/** The most headers one `auth` frame may carry. */
const MAX_FRAME_HEADERS = 64;

/*
 * Set by the browser, or by a proxy in front of the server, never by a
 * script: taken from a frame, one would let a client say what only they
 * may — who sent it, from where, with which cookies.
 */
const NOT_FROM_A_FRAME: ReadonlySet<string> = new Set([
  "accept-charset",
  "accept-encoding",
  "connection",
  "content-length",
  "cookie",
  "cookie2",
  "date",
  "dnt",
  "expect",
  "forwarded",
  "host",
  "keep-alive",
  "origin",
  "referer",
  "set-cookie",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "via",
  "x-real-ip",
  "x-client-ip",
  "true-client-ip",
  "cf-connecting-ip",
  "fastly-client-ip",
  "x-cluster-client-ip",
]);
const NOT_FROM_A_FRAME_PREFIXES = ["sec-", "proxy-", "x-forwarded-", "access-control-"];

/** What a client's `auth` frame proves who it is with. */
export interface FrameCredentials {
  /** Headers the client could not put on its handshake */
  readonly headers: ReadonlyArray<readonly [string, string]>;
  /** The client's `ws.auth`, which `onConnect` and `onReauth` read as `auth` */
  readonly auth: WSAuthParams | undefined;
}

/**
 * Read the payload of an `auth` frame.
 *
 * @param payload - The frame's payload
 * @returns Its credentials; `undefined` for a payload no client sends — not
 *   an object, headers that are not strings, more of them than the server reads
 * @example
 * ```ts
 * frameCredentials({ headers: { authorization: "Bearer t1" }, auth: { tenant: "t1" } });
 * ```
 */
export function frameCredentials(payload: unknown): FrameCredentials | undefined {
  if (payload === undefined) return { headers: [], auth: undefined };
  if (!isFieldRecord(payload)) return undefined;
  const { headers, auth } = payload;
  if (auth !== undefined && !isFieldRecord(auth)) return undefined;
  if (headers === undefined) return { headers: [], auth };
  if (!isFieldRecord(headers)) return undefined;
  const pairs = Object.entries(headers);
  if (pairs.length > MAX_FRAME_HEADERS) return undefined;
  const named = pairs.filter((pair): pair is [string, string] => typeof pair[1] === "string");
  return named.length === pairs.length ? { headers: named, auth } : undefined;
}

/**
 * The handshake as a connection's hooks, middleware and session read it:
 * with the headers its `auth` frame carries that a browser could not put on
 * it. A header the handshake has keeps its value, and none a browser or a
 * proxy in front sets itself — cookies, `Origin`, forwarding — is taken
 * from a frame, which says so in the log.
 *
 * @param handshake - The upgrade request
 * @param frame - What the frame carries
 * @returns The request, the handshake itself when the frame adds nothing;
 *   `undefined` when a header is not one HTTP can carry
 * @example
 * ```ts
 * ctx.request = withFrameHeaders(ctx.handshake, credentials) ?? ctx.handshake;
 * ```
 */
export function withFrameHeaders(handshake: Request, frame: FrameCredentials): Request | undefined {
  const headers = frameHeadersOver(handshake.headers, frame);
  if (headers === undefined) return undefined;
  if (headers === handshake.headers) return handshake;
  const request = new Request(handshake.url, { method: handshake.method, headers });
  rememberPeerAddress(request, peerAddressOf(handshake));
  return request;
}

/**
 * A handshake's headers with those an `auth` frame adds, as
 * `withFrameHeaders` takes them — for a server that keeps headers alone,
 * such as a mock's.
 *
 * @param handshake - The upgrade request's headers
 * @param frame - What the frame carries
 * @returns The headers, the handshake's own when the frame adds nothing;
 *   `undefined` when a header is not one HTTP can carry
 * @example
 * ```ts
 * socket.headers = frameHeadersOver(socket.handshake, credentials) ?? socket.handshake;
 * ```
 */
export function frameHeadersOver(handshake: Headers, frame: FrameCredentials): Headers | undefined {
  const added = frame.headers.filter(([name]) => takenFromFrame(name.toLowerCase()));
  const fresh = added.filter(([name]) => !handshake.has(name));
  if (fresh.length === 0) return handshake;
  const headers = new Headers(handshake);
  try {
    for (const [name, value] of fresh) headers.set(name, value);
  } catch (error) {
    log.warn("An auth frame carried a header HTTP cannot", error);
    return undefined;
  }
  return headers;
}

const refused = new Set<string>();

function takenFromFrame(name: string): boolean {
  const forbidden =
    NOT_FROM_A_FRAME.has(name) || NOT_FROM_A_FRAME_PREFIXES.some((p) => name.startsWith(p));
  if (forbidden && !refused.has(name)) {
    refused.add(name);
    log.warn(`An auth frame's ${name} header is not taken: only a browser or a proxy sets it`);
  }
  return !forbidden;
}
