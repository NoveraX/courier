import { CourierError } from "../errors/courier-error";

/** The stable names of the ways a request body is refused. */
export type BodyErrorCode =
  | "BODY_TOO_LARGE"
  | "BODY_INCOMPLETE"
  | "BODY_MALFORMED"
  | "BODY_TIMEOUT"
  | "BODY_ENCODING_UNSUPPORTED"
  | "BODY_ABORTED"
  | "BODY_UNREADABLE"
  | "UPLOAD_TOO_MANY_PARTS"
  | "UPLOAD_PART_HEADERS_TOO_LARGE"
  | "UPLOAD_FIELDS_TOO_LARGE"
  | "UPLOAD_STORAGE_FULL";

/** The statuses a refused request body is answered with. */
export type BodyErrorStatus = 400 | 408 | 413 | 415 | 507;

/* An incomplete body is answered 413, as a body over the limit is: what cut
   it short was, in every case seen, a framework's own limit on its size. */
const STATUS: Readonly<Record<BodyErrorCode, BodyErrorStatus>> = {
  BODY_TOO_LARGE: 413,
  BODY_INCOMPLETE: 413,
  BODY_MALFORMED: 400,
  BODY_TIMEOUT: 408,
  BODY_ENCODING_UNSUPPORTED: 415,
  BODY_ABORTED: 400,
  BODY_UNREADABLE: 400,
  UPLOAD_TOO_MANY_PARTS: 413,
  UPLOAD_PART_HEADERS_TOO_LARGE: 413,
  UPLOAD_FIELDS_TOO_LARGE: 413,
  UPLOAD_STORAGE_FULL: 507,
};

/**
 * Why a request body was not taken, and the status it is answered with:
 * one of Courier's own errors, its code the refusal's stable name.
 *
 * A body stream errors with it, so whatever reads the body — a JSON decoder,
 * the multipart parser, `Response.formData()` — fails with the reason the
 * body was refused for rather than one of its own; a fetch that sends the
 * body on fails with it too, and is passed on as it is, as every Courier
 * error is. The message is written for the developer reading the answer,
 * and holds nothing the client sent.
 *
 * @example
 * ```ts
 * throw new BodyError("BODY_TOO_LARGE", "Request body exceeds 1048576 bytes");
 * ```
 */
export class BodyError extends CourierError<BodyErrorCode> {
  /** The HTTP status the refusal is answered with. */
  readonly status: BodyErrorStatus;

  constructor(code: BodyErrorCode, message: string, options?: ErrorOptions) {
    super(message, { code, cause: options?.cause });
    this.name = "BodyError";
    this.status = STATUS[code];
  }
}

/* How deep a failure's causes are searched: fetch wraps the body's error, a transport failure wraps fetch's. */
const CAUSE_DEPTH = 4;

/**
 * The refusal of the request body a call was sending, when that is what
 * failed the call: an upload sent on as it arrives fails fetch with the
 * body's own `BodyError`, which fetch's failure — and the transport failure
 * made of it — carry as their cause.
 *
 * @param error - What the call failed with
 * @returns The body's refusal, or `undefined` for a call that failed for another reason
 *
 * @example
 * ```ts
 * const refused = bodyErrorOf(error);
 * if (refused) return errorResponse(refused.status, refused.message, refused.code);
 * ```
 */
export function bodyErrorOf(error: unknown): BodyError | undefined {
  let cause = error;
  for (let depth = 0; depth <= CAUSE_DEPTH && cause instanceof Error; depth++) {
    if (cause instanceof BodyError) return cause;
    cause = cause.cause;
  }
  return undefined;
}
