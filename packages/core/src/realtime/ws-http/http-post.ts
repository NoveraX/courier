import type { PlatformFetch } from "../../http-client/source-transport";
import { REQUEST_MEMBERS } from "../../utils/request-members";
import { retryAfterWait } from "../../utils/retry-after";
import { withinSignal } from "../../utils/within-signal";
import { HTTP_REFUSALS } from "../ws/http-protocol";

/** Where a socket's requests go, and what they are made with. */
export interface PostTerms {
  /** The socket's path, over HTTP */
  readonly url: string;
  /** The source's `fetch`, else the platform's */
  readonly fetch?: PlatformFetch | undefined;
  /**
   * What every request is made with besides its method, headers, body and
   * signal: the source's credentials policy, its dispatcher. Cookies go
   * unless it says otherwise, as they go with a socket's handshake.
   */
  readonly init?: RequestInit | undefined;
}

/**
 * A socket's address as HTTP takes it: the same host, path and query, the
 * scheme `http:` for `ws:` and `https:` for `wss:`.
 *
 * @param url - The socket's address
 * @returns Where its requests go
 * @example
 * ```ts
 * httpAddressOf("wss://api.example.com/ws?room=7"); // "https://api.example.com/ws?room=7"
 * ```
 */
export function httpAddressOf(url: string): string {
  const address = new URL(url);
  if (address.protocol === "ws:") address.protocol = "http:";
  else if (address.protocol === "wss:") address.protocol = "https:";
  return address.toString();
}

/** A request's answer, as the socket acts on it. */
export type Posted =
  /** 200, with its events, or 204 */
  | { readonly kind: "answered"; readonly response: Response }
  /**
   * Not answered now — by the network, an entry or the replicas — so it is
   * made again, not before `afterMs` when one was asked for; `error` is
   * what the platform said of a request the network did not carry
   */
  | { readonly kind: "again"; readonly afterMs: number | undefined; readonly error?: unknown }
  /** The connection is no more: no replica holds it, or the one that does cannot be reached */
  | { readonly kind: "gone" }
  /** No HTTP transport answers at the socket's path: 404 or 405, or a 200 with no events */
  | { readonly kind: "absent" }
  /** Refused: the socket closes with the code a socket would */
  | { readonly kind: "refused"; readonly code: number; readonly reason: string };

/** What a refusal's body is read to: a Courier server's is a few dozen bytes. */
const MAX_REFUSAL_BYTES = 4096;
/** The waits between a request's attempts: from a quarter of a second, doubling up to 4 s. */
const FIRST_WAIT_MS = 250;
const LONGEST_WAIT_MS = 4000;

/**
 * How long to wait before making a request again: what the server asked
 * for, or a wait that doubles with each attempt that failed, each a random
 * part of it, so the clients one outage stopped do not come back together.
 *
 * @param afterMs - What the server asked for, if it did
 * @param failures - Attempts that failed before this one
 * @returns The wait, in milliseconds
 * @example
 * ```ts
 * waitBeforeAgain(undefined, 2); // between 500 and 1000
 * ```
 */
export function waitBeforeAgain(afterMs: number | undefined, failures: number): number {
  if (afterMs !== undefined) return afterMs;
  const most = Math.min(LONGEST_WAIT_MS, FIRST_WAIT_MS * 2 ** failures);
  return most / 2 + Math.random() * (most / 2);
}

/**
 * The close a socket ends with when its connection is gone, the transport
 * is not there, or a request was refused: the code a socket would close
 * with, so its connection reconnects, or stops, as for a socket.
 *
 * @param posted - The answer that ends it
 * @returns Its code and reason
 * @example
 * ```ts
 * endingOf({ kind: "gone" }); // { code: 1006, reason: "The server no longer holds the connection" }
 * ```
 */
export function endingOf(posted: Exclude<Posted, { readonly kind: "answered" | "again" }>): {
  readonly code: number;
  readonly reason: string;
} {
  switch (posted.kind) {
    case "gone":
      return { code: 1006, reason: "The server no longer holds the connection" };
    case "absent":
      return { code: 1006, reason: "No HTTP transport answers at the socket's path" };
    case "refused":
      return { code: posted.code, reason: posted.reason };
  }
}

/**
 * An answer as a connection that opened takes it: one from no HTTP
 * transport is one to make again. While a rollout runs, the replica that
 * answered may be one of the earlier release, and the next request, dealt
 * to another, reaches one that answers. Were the transport gone from every
 * replica, nothing would come, and the connection's liveness watch would
 * take it for dead, as it would a socket.
 *
 * @param posted - How a request on the connection came out
 * @returns How the connection takes it
 * @example
 * ```ts
 * againIfAbsent({ kind: "absent" }); // { kind: "again", afterMs: undefined }
 * ```
 */
export function againIfAbsent(posted: Posted): Posted {
  return posted.kind === "absent" ? { kind: "again", afterMs: undefined } : posted;
}

/**
 * Make one request of the transport and say how it came out. A request the
 * network did not carry, or an entry or the server could not answer now, is
 * one to make again; one the attempt gave up is too, and its caller, who
 * gave it up, knows.
 *
 * @param terms - Where it goes, and with what
 * @param body - Its head and frames
 * @param signal - The attempt's
 * @param extra - Headers of its own, and whether it outlives the page
 * @returns How it came out
 * @example
 * ```ts
 * const posted = await post(terms, '{"op":"poll","token":"…","ack":4}', attempt.signal);
 * if (posted.kind === "answered") read(posted.response);
 * ```
 */
export async function post(
  terms: PostTerms,
  body: string,
  signal: AbortSignal,
  extra: { readonly headers?: Readonly<Record<string, string>>; readonly keepalive?: true } = {},
): Promise<Posted> {
  const send = terms.fetch ?? fetch;
  try {
    const request = send(terms.url, {
      __proto__: null,
      ...REQUEST_MEMBERS,
      credentials: "include",
      ...terms.init,
      method: "POST",
      headers: { ...extra.headers, "Content-Type": "text/plain;charset=UTF-8" },
      body,
      signal,
      ...(extra.keepalive && { keepalive: true }),
    } as RequestInit);
    const response = await withinSignal(signal, request, (late) => {
      late.body?.cancel().catch(() => undefined);
    });
    return await postedOf(response, signal);
  } catch (error) {
    return { kind: "again", afterMs: undefined, error };
  }
}

/**
 * How an answer came out, as the socket acts on it. A status of an entry's
 * is one of the server's only when its body names the server's code, and
 * only such a refusal stops the connection. A 200 is the transport's only
 * with events, as each of its is: an entry's page, or another app's answer
 * at the path, is no transport.
 *
 * @param response - The answer, or the one a `refused` event stands for
 * @param signal - The attempt's, which ends the read of a refusal's body
 * @returns How it came out
 * @example
 * ```ts
 * const posted = await postedOf(await fetch(url, init), attempt.signal);
 * ```
 */
export async function postedOf(response: Response, signal: AbortSignal): Promise<Posted> {
  const { status } = response;
  if (status === 204 || (status === 200 && isEventStream(response))) {
    return { kind: "answered", response };
  }
  if (status === 200) {
    await response.body?.cancel().catch(() => undefined);
    return { kind: "absent" };
  }
  const said = await refusalOf(response, signal);
  if (status === 410 || said.code === HTTP_REFUSALS.unreachable) return { kind: "gone" };
  if (status === 404 || status === 405) return { kind: "absent" };
  if (status === 429 || status >= 500) {
    return {
      kind: "again",
      afterMs: retryAfterWait(response.headers.get("Retry-After"), Date.now()),
    };
  }
  return { kind: "refused", ...refusedOf(status, said) };
}

/* What a refusal's JSON body says: the code it names, and its message. */
interface Said {
  readonly code?: unknown;
  readonly message?: string;
}

/*
 * The server's refusals that end a connection for good, by the code their
 * bodies name, and the close each ends a socket with, as the server's
 * socket closes for the same: a request it cannot read, 1002, and an
 * origin or a host it does not serve, 4403 and 4421. Only the server's
 * word stops a connection: a status, which an entry or a gateway answers
 * with too, does not, whatever its body says.
 */
const FINAL_REFUSALS: ReadonlyMap<unknown, number> = new Map<unknown, number>([
  [HTTP_REFUSALS.malformed, 1002],
  ["BODY_MALFORMED", 1002],
  ["ORIGIN_NOT_ALLOWED", 4403],
  ["HOST_NOT_ALLOWED", 4421],
]);

/*
 * The close a refusal ends a socket with. Any other than those — the
 * server's that a new connection gets past, as another version of the
 * transport or frames it did not receive, and every one of an entry's —
 * closes as a socket the network cut, with 1006, or 1009 for a body too
 * large, and the connection is made again.
 */
function refusedOf(status: number, said: Said): { readonly code: number; readonly reason: string } {
  const final = FINAL_REFUSALS.get(said.code);
  if (final !== undefined) {
    return { code: final, reason: said.message ?? `The server answered ${status}` };
  }
  const answered = `The socket's path answered ${status}`;
  return {
    code: status === 413 ? 1009 : 1006,
    reason: said.message === undefined ? answered : `${answered}: ${said.message}`,
  };
}

function isEventStream(response: Response): boolean {
  const essence = response.headers.get("Content-Type")?.split(";")[0]?.trim().toLowerCase();
  return essence === "text/event-stream";
}

/* The code and message of a JSON refusal; an entry's page says neither. */
async function refusalOf(response: Response, signal: AbortSignal): Promise<Said> {
  const body = response.body;
  if (body === null) return {};
  if (!response.headers.get("Content-Type")?.includes("json")) {
    await body.cancel().catch(() => undefined);
    return {};
  }
  try {
    const said: unknown = JSON.parse(await boundedText(body, signal));
    if (typeof said !== "object" || said === null) return {};
    const { code, message } = said as Record<string, unknown>;
    return { code, ...(typeof message === "string" && { message }) };
  } catch {
    return {};
  }
}

/* The body's text, up to its bound: one longer is let go of, and says nothing. */
async function boundedText(body: ReadableStream<Uint8Array>, signal: AbortSignal): Promise<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  let size = 0;
  for (;;) {
    const read = await withinSignal(signal, reader.read());
    if (read.done) return text + decoder.decode();
    size += read.value.byteLength;
    if (size > MAX_REFUSAL_BYTES) {
      await reader.cancel();
      return "";
    }
    text += decoder.decode(read.value, { stream: true });
  }
}
