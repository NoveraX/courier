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
  | "UPLOAD_FIELDS_TOO_LARGE";

/* An incomplete body is answered 413, as a body over the limit is: what cut
   it short was, in every case seen, a framework's own limit on its size. */
const STATUS: Readonly<Record<BodyErrorCode, number>> = {
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
};

/**
 * Why a request body was not taken, and the status it is answered with.
 *
 * A body stream errors with it, so whatever reads the body — a JSON decoder,
 * the multipart parser, `Response.formData()` — fails with the reason the
 * body was refused for rather than one of its own. The message is written
 * for the developer reading the answer, and holds nothing the client sent.
 *
 * @example
 * ```ts
 * throw new BodyError("BODY_TOO_LARGE", "Request body exceeds 1048576 bytes");
 * ```
 */
export class BodyError extends Error {
  /** The refusal's stable name. */
  readonly code: BodyErrorCode;
  /** The HTTP status the refusal is answered with. */
  readonly status: number;

  constructor(code: BodyErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "BodyError";
    this.code = code;
    this.status = STATUS[code];
  }
}
