import { isCode, isCount, isString } from "../../realtime/ws/frame-fields";
import {
  HTTP_FALLBACK_CAUSES,
  type HTTPFallbackCause,
  type HTTPOperation,
  type HTTPRequestHead,
} from "../../realtime/ws/http-protocol";
import { isRecord } from "../../utils/is-record";
import { ownFields } from "../../utils/own";

/** A request of the HTTP transport, as its body says it. */
export interface HTTPRequest {
  readonly head: HTTPRequestHead;
  /** The client's frames, in the order it sent them */
  readonly frames: readonly string[];
}

const OPERATIONS: ReadonlySet<string> = new Set<HTTPOperation>(["stream", "poll", "send", "close"]);
const CAUSES: ReadonlySet<unknown> = new Set<HTTPFallbackCause>(HTTP_FALLBACK_CAUSES);

/**
 * Read a request's body: its head, and the frames after it.
 *
 * Frames come on the request that opens a connection and on `send`, and
 * `send` numbers the first of them; a body that breaks either rule, or whose
 * head is no head, is none of the transport's. A cause the server does not
 * know, as a later client may name, is read as none.
 *
 * @param text - The body
 * @returns The request, or `undefined` for a body that is none
 * @example
 * ```ts
 * readHTTPRequest('{"op":"send","token":"…","seq":3}\n{"type":"ping"}');
 * // { head: { op: "send", token: "…", seq: 3 }, frames: ['{"type":"ping"}'] }
 * ```
 */
export function readHTTPRequest(text: string): HTTPRequest | undefined {
  const end = text.indexOf("\n");
  const head = headOf(end === -1 ? text : text.slice(0, end));
  if (head === undefined) return undefined;
  const frames =
    end === -1
      ? []
      : text
          .slice(end + 1)
          .split("\n")
          .filter((line) => line !== "");
  if (frames.length > 0 && head.token !== undefined && head.op !== "send") return undefined;
  if (frames.length > 0 && head.op === "send" && head.seq === undefined) return undefined;
  return { head, frames };
}

function headOf(line: string): HTTPRequestHead | undefined {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    return undefined;
  }
  if (!isRecord(value)) return undefined;
  const { op, v, token, ack, seq, code, cause } = ownFields(value);
  if (typeof op !== "string" || !OPERATIONS.has(op)) return undefined;
  const holds =
    absentOr(v, isCount) &&
    absentOr(token, isString) &&
    absentOr(ack, isAck) &&
    absentOr(seq, isCount) &&
    absentOr(code, isCode);
  if (!holds) return undefined;
  const named = CAUSES.has(cause) ? (cause as HTTPFallbackCause) : undefined;
  return { op, v, token, ack, seq, code, cause: named } as HTTPRequestHead;
}

function absentOr(value: unknown, check: (value: unknown) => boolean): boolean {
  return value === undefined || check(value);
}

/* None taken yet is 0. */
function isAck(value: unknown): value is number {
  return value === 0 || isCount(value);
}
