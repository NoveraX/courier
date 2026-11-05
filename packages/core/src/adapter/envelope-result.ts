import { createLogger } from "../logger";
import type { BodyError } from "./body-error";
import type { Envelope } from "./parse-envelope";

const log = createLogger("Proxy");

/** The status, message and code a proxy POST's body is refused with. */
export interface EnvelopeRefusal {
  ok: false;
  status: number;
  message: string;
  code?: string | undefined;
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
  else log.debug(`${error.code}: ${error.message}`);
  return { ok: false, status: error.status, message: error.message, code: error.code };
}
