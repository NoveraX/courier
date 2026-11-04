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

import { BodyError } from "./body-error";
import { declaredLength } from "./declared-length";
import { discardBody } from "./discard-body";
import { LIMITS } from "./limits";
import { readChunk } from "./read-chunk";

/** What a request body is held to while it is read. */
export interface BodyLimits {
  /** Largest body to take, in bytes */
  maxBytes: number;
  /** Longest wait for the next chunk, in milliseconds; 30 s unless given */
  idleTimeoutMs?: number | undefined;
  /** Longest the whole body may take to arrive, in milliseconds; 5 minutes unless given */
  timeoutMs?: number | undefined;
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
): ReadableStream<Uint8Array> {
  const idleMs = limits.idleTimeoutMs ?? LIMITS.BODY_IDLE_TIMEOUT_MS;
  const timeoutMs = limits.timeoutMs ?? LIMITS.BODY_TIMEOUT_MS;
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let declared: number | undefined;
  let deadline: number | undefined;
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

  return new ReadableStream<Uint8Array>(
    {
      /* What the headers alone refuse fails the stream before a byte is read;
         thrown from here, it would fail the stream's constructor instead. */
      start(controller) {
        try {
          assertUncompressed(request.headers);
          declared = declaredLength(request.headers);
          if (declared !== undefined && declared > limits.maxBytes) {
            throw tooLarge(limits.maxBytes);
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
          if (declared !== undefined && declared > 0) throw incomplete(0, declared);
          return controller.close();
        }
        reader ??= body.getReader();
        deadline ??= performance.now() + timeoutMs;
        let next: ReadableStreamReadResult<Uint8Array>;
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
          if (declared !== undefined && received < declared) throw incomplete(received, declared);
          return controller.close();
        }
        received += next.value.byteLength;
        if (declared !== undefined && received > declared) refuse(overlong(declared));
        if (received > limits.maxBytes) refuse(tooLarge(limits.maxBytes));
        controller.enqueue(next.value);
      },
      cancel() {
        if (!finished) handOn();
      },
    },
    { highWaterMark: 0 },
  );
}

/* A compressed body is refused by name: read as it stands, it failed as an
   unreadable form or as JSON that does not parse. */
function assertUncompressed(headers: Headers): void {
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
  if (request.signal.aborted || connectionGone(error)) {
    return new BodyError("BODY_ABORTED", "The client stopped sending its request body", {
      cause: error,
    });
  }
  return new BodyError("BODY_UNREADABLE", "Request body could not be read", { cause: error });
}

function connectionGone(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    CONNECTION_GONE.has(error.code)
  );
}

function tooLarge(limit: number): BodyError {
  return new BodyError("BODY_TOO_LARGE", `Request body exceeds ${limit} bytes`);
}

function overlong(declared: number): BodyError {
  return new BodyError(
    "BODY_MALFORMED",
    `The request body is longer than the ${declared} bytes its Content-Length declares`,
  );
}

function incomplete(received: number, declared: number): BodyError {
  return new BodyError(
    "BODY_INCOMPLETE",
    `The request body ended after ${received} of the ${declared} bytes its Content-Length declares: ` +
      "something in front of this route cut it short. Next.js does when its proxy (middleware) " +
      "runs on the route, passing on only the first experimental.proxyClientMaxBodySize bytes, " +
      "10 MB unless configured",
  );
}
