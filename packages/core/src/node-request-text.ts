import type { IncomingMessage } from "node:http";
import { BodyError } from "./adapter/body-error";
import { declaredLength } from "./adapter/declared-length";
import {
  assertUncompressed,
  type BodyLimits,
  connectionGone,
  incompleteBody,
  overlongBody,
  tooLargeBody,
  unreadableBody,
} from "./adapter/read-body";
import { type BodyText, notUTF8Body } from "./adapter/read-body-text";
import { chunkTimer, clientLeft } from "./adapter/read-chunk";
import { LIMITS } from "./limits";
import { nodeHeadersOf } from "./node-headers";
import { bodyAlreadyRead, isBodySpent } from "./node-request";
import { isErrorNamed } from "./utils/is-error";

/* A whole body is decoded at a time, which leaves the decoder as it was: one serves every request. */
const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: false });

/**
 * A Node request's body as UTF-8 text, read off Node's own stream — no web
 * stream or `Request` is made for it — and held to its limits as
 * `readBodyText` holds a web request's: a body that declares or sends more
 * than `maxBytes`, runs past its `Content-Length` or ends short of it, is
 * compressed, pauses longer than the idle limit or takes longer than its
 * whole time, or whose client leaves, is refused for that; bytes that are
 * not UTF-8 are refused rather than replaced. What a refused body still
 * sends is taken off the connection unread, so a browser that is still
 * sending reads its answer.
 *
 * @param nodeReq - The request, its body unread
 * @param limits - Its largest size and longest waits
 * @param reader - What reads it, which an error names when the body was read before
 * @returns The text, or the refusal
 * @throws ConfigurationError `REQUEST_BODY_ALREADY_READ` when something read the body first
 * @example
 * ```ts
 * const body = await readNodeBodyText(req, { maxBytes: 1_048_576 }, "the HTTP transport");
 * if (!body.ok) res.writeHead(body.error.status).end();
 * ```
 */
export function readNodeBodyText(
  nodeReq: IncomingMessage,
  limits: BodyLimits,
  reader: string,
): Promise<BodyText> {
  if (isBodySpent(nodeReq)) return Promise.reject(bodyAlreadyRead(reader));
  let declared: number | undefined;
  try {
    const headers = nodeHeadersOf(nodeReq);
    assertUncompressed(headers);
    declared = declaredLength(headers);
    if (declared !== undefined && declared > limits.maxBytes) throw tooLargeBody(limits.maxBytes);
  } catch (error) {
    if (!(error instanceof BodyError)) return Promise.reject(error);
    nodeReq.resume();
    return Promise.resolve({ ok: false, error });
  }
  const timeoutMs = limits.timeoutMs ?? LIMITS.BODY_TIMEOUT_MS;
  const wait = {
    idleMs: limits.idleTimeoutMs ?? LIMITS.BODY_IDLE_TIMEOUT_MS,
    deadline: limits.deadline ?? performance.now() + timeoutMs,
    timeoutMs,
  };
  const length = declared;

  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    let received = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    function settle(result: BodyText): void {
      clearTimeout(timer);
      nodeReq.off("data", onData);
      nodeReq.off("end", onEnd);
      nodeReq.off("error", onError);
      nodeReq.off("close", onClose);
      resolve(result);
    }
    /* What a body refused while it still comes sends after is taken off the connection unread. */
    function refuse(error: BodyError, unread: boolean): void {
      settle({ ok: false, error });
      if (unread) nodeReq.resume();
    }
    function onData(chunk: Buffer): void {
      received += chunk.byteLength;
      const excess = excessOf(received, length, limits.maxBytes);
      if (excess !== undefined) {
        refuse(excess, true);
        return;
      }
      chunks.push(chunk);
      clearTimeout(timer);
      /* A body that has all its declared length waits for nothing more but its end. */
      timer = received === length ? undefined : chunkTimer(wait, (late) => refuse(late, true));
    }
    function onEnd(): void {
      if (length !== undefined && received < length) {
        refuse(incompleteBody(received, length), false);
        return;
      }
      const text = utf8Of(chunks, received);
      settle(text === undefined ? { ok: false, error: notUTF8Body() } : { ok: true, text });
    }
    function onError(error: unknown): void {
      refuse(connectionGone(error) ? clientLeft(error) : unreadableBody(error), false);
    }
    /* Closed before its end, which a read that was whole is told first: its client went away. */
    function onClose(): void {
      refuse(clientLeft(undefined), false);
    }

    nodeReq.on("data", onData);
    nodeReq.once("end", onEnd);
    nodeReq.once("error", onError);
    nodeReq.once("close", onClose);
    timer = chunkTimer(wait, (late) => refuse(late, true));
  });
}

/* What a body that has sent `received` bytes is refused for, if anything: running past the
   length it declared, or past the largest it may be. */
function excessOf(
  received: number,
  declared: number | undefined,
  maxBytes: number,
): BodyError | undefined {
  if (declared !== undefined && received > declared) return overlongBody(declared);
  if (received > maxBytes) return tooLargeBody(maxBytes);
  return undefined;
}

/* The bytes as text, or `undefined` for bytes that are not UTF-8. */
function utf8Of(chunks: readonly Buffer[], size: number): string | undefined {
  const bytes = chunks.length === 1 ? (chunks[0] as Buffer) : Buffer.concat(chunks, size);
  try {
    return decoder.decode(bytes);
  } catch (error) {
    if (isErrorNamed(error, "TypeError")) return undefined;
    throw error;
  }
}
