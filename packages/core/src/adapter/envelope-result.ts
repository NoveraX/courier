import { createLogger } from "../logger";
import { createRefusalLog } from "../logger/refusal-log";
import type { BodyError } from "./body-error";
import { UPLOAD_ROOM } from "./multipart/upload-hold";
import type { Envelope } from "./parse-envelope";

const log = createLogger("Proxy");
/* A crowd of clients meets this refusal at once: one line an interval says so, the rest counted. */
const atCapacity = createRefusalLog("Proxy");
const CAPACITY = {
  event: "upload refused, no room left for it",
  code: "UPLOAD_CAPACITY_REACHED",
} as const;

/** The status, message and code a proxy POST's body is refused with. */
export interface EnvelopeRefusal {
  ok: false;
  status: number;
  message: string;
  code?: string | undefined;
  /** Seconds the client is told to wait before it tries again, for a refusal that passes */
  retryAfter?: number | undefined;
}

/**
 * A proxy POST's envelope, or the refusal of its body. An envelope whose
 * upload holds something for the call — files kept, or the rest of one being
 * sent on — comes with `release`, to be awaited once the call is done,
 * however it ended.
 */
export type EnvelopeResult =
  | { ok: true; envelope: Envelope; release?: (() => Promise<void>) | undefined }
  | EnvelopeRefusal;

/**
 * The answer to a body that was not taken, told once in the log.
 *
 * A browser that cancels an upload closes the connection mid-body. That is
 * the client's decision, not the server's failure, and stays at debug level;
 * so do refusals of what the client sent. A read that fails while the
 * client is still there, and a body something cut short, say little in the
 * answer alone and are warned of.
 *
 * @param error - Why the body was refused
 * @returns The refusal, with the error's status, message and code
 *
 * @example
 * ```ts
 * if (error instanceof BodyError) return refusedBody(error);
 * ```
 */
export function refusedBody(error: BodyError): EnvelopeRefusal {
  if (error.code === "BODY_UNREADABLE") log.warn(error.message, error.cause);
  else if (error.code === "BODY_INCOMPLETE") log.warn(`${error.code}: ${error.message}`);
  else if (error.code === "UPLOAD_CAPACITY_REACHED") atCapacity.warn(CAPACITY);
  else log.debug(`${error.code}: ${error.message}`);
  const refusal = {
    ok: false,
    status: error.status,
    message: error.message,
    code: error.code,
  } as const;
  return error.code === "UPLOAD_CAPACITY_REACHED"
    ? { ...refusal, retryAfter: UPLOAD_ROOM.RETRY_AFTER_S }
    : refusal;
}
