import { REQUEST_MEMBERS } from "../../utils/request-members";
import { retryAfterWait } from "../../utils/retry-after";
import { withinSignal } from "../../utils/within-signal";
import { HTTP_REFUSALS } from "../ws/http-protocol";

/** Where a socket's requests go, and what they are made with. */
export interface PostTerms {
  /** The socket's path, over HTTP */
  readonly url: string;
  /** The source's `fetch`, else the platform's */
  readonly fetch?: typeof fetch | undefined;
  /**
   * What every request is made with besides its method, headers, body and
   * signal: the source's credentials policy, its dispatcher. Cookies go
   * unless it says otherwise, as they go with a socket's handshake.
   */
  readonly init?: RequestInit | undefined;
}

/** A request's answer, as the socket acts on it. */
export type Posted =
  /** 200, with its events, or 204 */
  | { readonly kind: "answered"; readonly response: Response }
  /** Not answered now — by the network, an entry or the replicas — so it is made again, not before `afterMs` when one was asked for */
  | { readonly kind: "again"; readonly afterMs: number | undefined }
  /** The connection is no more: no replica holds it, or the one that does cannot be reached */
  | { readonly kind: "gone" }
  /** No HTTP transport answers at the socket's path */
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
  } catch {
    return { kind: "again", afterMs: undefined };
  }
}

/* A status of an entry's is one of the server's only when its body names the transport's code. */
async function postedOf(response: Response, signal: AbortSignal): Promise<Posted> {
  const { status } = response;
  if (status === 200 || status === 204) return { kind: "answered", response };
  const said = await refusalOf(response, signal);
  if (status === 410 || said.code === HTTP_REFUSALS.unreachable) return { kind: "gone" };
  if (status === 404 || status === 405) return { kind: "absent" };
  if (status === 429 || status >= 500) {
    return {
      kind: "again",
      afterMs: retryAfterWait(response.headers.get("Retry-After"), Date.now()),
    };
  }
  const reason = said.message ?? `The server answered ${status}`;
  /* Another version of the transport, a body too large for the server, or a request it refused. */
  const code = status === 400 ? 1002 : status === 413 ? 1009 : 1006;
  return { kind: "refused", code, reason };
}

/* The code and message of a server's JSON refusal; an entry's page says neither. */
async function refusalOf(
  response: Response,
  signal: AbortSignal,
): Promise<{ readonly code?: unknown; readonly message?: string }> {
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
