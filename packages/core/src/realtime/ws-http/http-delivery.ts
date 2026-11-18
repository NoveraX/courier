import { ONCE } from "../../utils/own";
import { type AnswerParts, readAnswer } from "./http-answer";
import { type Posted, type PostTerms, post } from "./http-post";

/** One answer of the server's frames to ask for. */
export interface DeliveryRequest {
  readonly terms: PostTerms;
  /** Its head, and on the request that opens the connection the client's first frames */
  readonly body: string;
  /** Headers of its own: the handshake's, on the request that opens the connection */
  readonly headers?: Readonly<Record<string, string>> | undefined;
  /** For a stream, how long its first bytes may take; none for a poll */
  readonly probeMs?: number | undefined;
  /** The socket's, whose abort ends the answer */
  readonly life: AbortSignal;
}

/** How one answer came out. */
export type Delivered =
  /** It ended, its frames taken: the next is asked for at once */
  | { readonly kind: "next" }
  /**
   * It was not answered, was cut short, or ended with nothing as soon as it
   * began: the next after a wait, the server's when it asked for one;
   * `error` is what the platform said of a request the network did not carry
   */
  | { readonly kind: "again"; readonly afterMs: number | undefined; readonly error?: unknown }
  /** A stream whose first bytes did not come in time: something on the way holds answers back */
  | { readonly kind: "held" }
  /** The connection is gone, the transport is not there, or the request was refused */
  | {
      readonly kind: "ended";
      readonly posted: Exclude<Posted, { readonly kind: "answered" | "again" }>;
    };

const NEXT: Delivered = { kind: "next" };
const AGAIN: Delivered = { kind: "again", afterMs: undefined };
const HELD: Delivered = { kind: "held" };
/* An answer that ends with nothing sooner than this was cut by something on the way, not held by the server. */
const SOON_MS = 1000;

/**
 * Ask for one answer of the server's frames — a stream, or a poll — and
 * read it to its end, each part handed on as it comes. A stream whose first
 * bytes do not come in `probeMs` is given up, and said to be held back.
 *
 * @param request - What to ask for, and where
 * @param parts - What counts the answer's bytes, and takes its `open` event, its frames and its `close`
 * @returns How it came out
 * @example
 * ```ts
 * const parts = { received, opened, frame, closed };
 * const delivered = await deliverOnce({ terms, body, probeMs: 3000, life }, parts);
 * if (delivered.kind === "held") mode = "poll";
 * ```
 */
export async function deliverOnce(
  request: DeliveryRequest,
  parts: AnswerParts,
): Promise<Delivered> {
  const attempt = new AbortController();
  const stop = (): void => attempt.abort();
  request.life.addEventListener("abort", stop, ONCE);
  const begun = performance.now();
  let started = false;
  const probe =
    request.probeMs === undefined
      ? undefined
      : setTimeout(() => {
          if (!started) attempt.abort();
        }, request.probeMs);
  const held = (): boolean => attempt.signal.aborted && !started && !request.life.aborted;
  try {
    const extra = request.headers === undefined ? {} : { headers: request.headers };
    const posted = await post(request.terms, request.body, attempt.signal, extra);
    if (held()) return HELD;
    if (posted.kind === "again") return posted;
    if (posted.kind !== "answered") return { kind: "ended", posted };
    const { body } = posted.response;
    if (body === null) return AGAIN;
    await readAnswer(
      body,
      {
        ...parts,
        received(bytes) {
          started = true;
          clearTimeout(probe);
          parts.received(bytes);
        },
      },
      attempt.signal,
    );
    return started || performance.now() - begun >= SOON_MS ? NEXT : AGAIN;
  } catch {
    return held() ? HELD : AGAIN;
  } finally {
    clearTimeout(probe);
    request.life.removeEventListener("abort", stop);
  }
}
