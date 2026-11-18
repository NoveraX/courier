/**
 * Reading a request body without letting the caller choose how much memory,
 * or how much time, the server spends on it — and without taking a body cut
 * short for a whole one.
 *
 * `Request.json()` and `Request.formData()` buffer whatever arrives. A caller
 * that opens a chunked request and keeps writing holds the process's memory
 * for as long as it likes, and the proxy is reachable by anyone the origin
 * check admits. `Content-Length` is the cheap half of the answer and not the
 * whole one: it is absent on a chunked request, and a caller that wants to
 * spend the server's memory simply omits it. Where it is present, it is also
 * what tells a whole body from one a framework stopped passing on: Next.js
 * ends the stream it hands a route at its proxy's body limit, and keeps the
 * client's length.
 */

import { LIMITS } from "../limits";
import { UNQUEUED } from "../utils/own";
import { BodyError } from "./body-error";
import { declaredLength } from "./declared-length";
import { discardBody } from "./discard-body";
import { clientLeft, readChunk } from "./read-chunk";

/** What a request body is held to while it is read. */
export interface BodyLimits {
  /** Largest body to take, in bytes */
  maxBytes: number;
  /** Longest wait for the next chunk, in milliseconds; 30 s unless given */
  idleTimeoutMs?: number | undefined;
  /** Longest the whole body may take to arrive, in milliseconds; 5 minutes unless given */
  timeoutMs?: number | undefined;
  /** The `performance.now()` time by which it must have arrived; `timeoutMs` after its first read unless given */
  deadline?: number | undefined;
}

/* What a read fails with when the connection went from under it; Windows
   names one it aborted ECONNABORTED. */
const CONNECTION_GONE: ReadonlySet<unknown> = new Set(["ECONNRESET", "ECONNABORTED"]);

/**
 * A request's body as it arrives, held to its limits and to its own length.
 *
 * The chunks are passed on as they come, none of them copied, and only as
 * fast as the reader asks: nothing is read ahead. The stream fails with a
 * `BodyError` — a body that declares or sends more than `maxBytes`, one that
 * ends short of its `Content-Length` or runs past it, a compressed one, a
 * pause or a whole body that takes too long, or a client that leaves. Every
 * refusal leaves the rest of the body to be taken off the connection and
 * dropped, as a reader that cancels the stream does: a browser reads the
 * answer only once its upload is done.
 *
 * @param request - The incoming request
 * @param limits - Its largest size and longest waits
 * @returns The body, as a stream that fails with the reason it was refused
 *
 * @example
 * ```ts
 * const form = await new Response(requestBodyStream(request, { maxBytes: 10_485_760 }), {
 *   headers: { "content-type": contentType },
 * }).formData();
 * ```
 */
export function requestBodyStream(
  request: Request,
  limits: BodyLimits,
): ReadableStream<Uint8Array<ArrayBuffer>> {
  const idleMs = limits.idleTimeoutMs ?? LIMITS.BODY_IDLE_TIMEOUT_MS;
  const timeoutMs = limits.timeoutMs ?? LIMITS.BODY_TIMEOUT_MS;
  let reader: ReadableStreamDefaultReader<Uint8Array<ArrayBuffer>> | undefined;
  let declared: number | undefined;
  let deadline = limits.deadline;
  let received = 0;
  let finished = false;

  /* Handed on, never cancelled: cancelling a framework's stream while its
     socket still delivers fails the framework's own listener. */
  const handOn = (): void => {
    finished = true;
    reader?.releaseLock();
    discardBody(request);
  };
  const refuse = (error: unknown): never => {
    const refusal = bodyError(request, error);
    /* A body whose client left, or whose read failed, has nothing left to take off. */
    if (refusal.code === "BODY_ABORTED" || refusal.code === "BODY_UNREADABLE") {
      finished = true;
      reader?.releaseLock();
    } else {
      handOn();
    }
    throw refusal;
  };

  return new ReadableStream<Uint8Array<ArrayBuffer>>(
    {
      __proto__: null,
      /* What the headers alone refuse fails the stream before a byte is read;
         thrown from here, it would fail the stream's constructor instead. */
      start(controller) {
        try {
          assertUncompressed(request.headers);
          declared = declaredLength(request.headers);
          if (declared !== undefined && declared > limits.maxBytes) {
            throw tooLargeBody(limits.maxBytes);
          }
        } catch (error) {
          handOn();
          controller.error(bodyError(request, error));
        }
      },
      async pull(controller) {
        const body = request.body;
        if (body === null) {
          finished = true;
          if (declared !== undefined && declared > 0) throw incompleteBody(0, declared);
          return controller.close();
        }
        reader ??= body.getReader();
        deadline ??= performance.now() + timeoutMs;
        let next: ReadableStreamReadResult<Uint8Array<ArrayBuffer>>;
        try {
          next = await readChunk(reader, { idleMs, deadline, timeoutMs, signal: request.signal });
        } catch (error) {
          if (finished) return;
          return refuse(error);
        }
        if (finished) return;
        if (next.done) {
          finished = true;
          reader.releaseLock();
          if (declared !== undefined && received < declared) {
            throw incompleteBody(received, declared);
          }
          return controller.close();
        }
        received += next.value.byteLength;
        if (declared !== undefined && received > declared) refuse(overlongBody(declared));
        if (received > limits.maxBytes) refuse(tooLargeBody(limits.maxBytes));
        controller.enqueue(next.value);
      },
      cancel() {
        if (!finished) handOn();
      },
    } as UnderlyingDefaultSource<Uint8Array<ArrayBuffer>>,
    UNQUEUED,
  );
}

/**
 * Refuse a compressed body by name: read as it stands, it failed as an
 * unreadable form or as JSON that does not parse.
 *
 * @param headers - The request's headers: a web request's, or a view of a Node request's
 * @throws BodyError `BODY_ENCODING_UNSUPPORTED` for a body with a `Content-Encoding`
 * @example
 * ```ts
 * assertUncompressed(request.headers);
 * ```
 */
export function assertUncompressed(headers: Pick<Headers, "get">): void {
  const encoding = headers.get("content-encoding")?.trim().toLowerCase();
  if (encoding === undefined || encoding === "" || encoding === "identity") return;
  throw new BodyError(
    "BODY_ENCODING_UNSUPPORTED",
    "A compressed request body is not accepted: send it without Content-Encoding",
  );
}

/**
 * The refusal a failed read is answered with. A read that fails while the
 * client is still there — a framework's own body limit, a broken chunked
 * encoding — is not the client leaving, and is told apart from it.
 */
function bodyError(request: Request, error: unknown): BodyError {
  if (error instanceof BodyError) return error;
  if (request.signal.aborted || connectionGone(error)) return clientLeft(error);
  return unreadableBody(error);
}

/**
 * The refusal of a body whose read failed while its client was still there:
 * a framework's own body limit, a broken chunked encoding.
 *
 * @param error - What the read failed with
 * @returns The refusal, `BODY_UNREADABLE`
 * @example
 * ```ts
 * req.once("error", (error) => refuse(connectionGone(error) ? clientLeft(error) : unreadableBody(error)));
 * ```
 */
export function unreadableBody(error: unknown): BodyError {
  return new BodyError("BODY_UNREADABLE", "Request body could not be read", { cause: error });
}

/**
 * Whether a read failed because the connection went from under it.
 *
 * @param error - What the read failed with
 * @returns `true` for a connection reset or aborted
 * @example
 * ```ts
 * connectionGone(Object.assign(new Error("aborted"), { code: "ECONNRESET" })); // → true
 * ```
 */
export function connectionGone(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    CONNECTION_GONE.has(error.code)
  );
}

/**
 * The refusal of a body larger than its limit, declared so or sent so.
 *
 * @param limit - The largest body taken, in bytes
 * @returns The refusal, `BODY_TOO_LARGE`
 * @example
 * ```ts
 * tooLargeBody(1_048_576).message; // "Request body exceeds 1048576 bytes"
 * ```
 */
export function tooLargeBody(limit: number): BodyError {
  return new BodyError("BODY_TOO_LARGE", `Request body exceeds ${limit} bytes`);
}

/**
 * The refusal of a body longer than its `Content-Length` declares.
 *
 * @param declared - The length declared, in bytes
 * @returns The refusal, `BODY_MALFORMED`
 * @example
 * ```ts
 * if (received > declared) refuse(overlongBody(declared));
 * ```
 */
export function overlongBody(declared: number): BodyError {
  return new BodyError(
    "BODY_MALFORMED",
    `The request body is longer than the ${declared} bytes its Content-Length declares`,
  );
}

/**
 * The refusal of a body that ended short of its `Content-Length`: something
 * in front of the route cut it short.
 *
 * @param received - The bytes that came
 * @param declared - The length declared
 * @returns The refusal, `BODY_INCOMPLETE`
 * @example
 * ```ts
 * if (received < declared) refuse(incompleteBody(received, declared));
 * ```
 */
export function incompleteBody(received: number, declared: number): BodyError {
  return new BodyError(
    "BODY_INCOMPLETE",
    `The request body ended after ${received} of the ${declared} bytes its Content-Length declares: ` +
      "something in front of this route cut it short. Next.js does when its proxy (middleware) " +
      "runs on the route, passing on only the first experimental.proxyClientMaxBodySize bytes, " +
      "10 MB unless configured",
  );
}
