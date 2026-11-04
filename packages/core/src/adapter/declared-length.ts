import { BodyError } from "./body-error";

const DIGITS = /^\d+$/;

/**
 * The length a request's headers give its body, when that length frames it.
 *
 * `Content-Length` is one or more digits (RFC 9110 §8.6); the same value
 * repeated as a list, which a header joined from several lines reads as, is
 * that value. A request with `Transfer-Encoding` is framed by its chunks, and
 * any length it also names is not its own (RFC 9112 §6.3). `Number()` alone
 * would have read an empty header as 0 and `" 1e3"` as 1000.
 *
 * @param headers - The request's headers
 * @returns The declared length in bytes, or `undefined` when none frames the body
 * @throws BodyError `BODY_MALFORMED` when the header is not a length
 *
 * @example
 * ```ts
 * declaredLength(new Headers({ "content-length": "42, 42" })); // → 42
 * declaredLength(new Headers({ "transfer-encoding": "chunked" })); // → undefined
 * ```
 */
export function declaredLength(headers: Headers): number | undefined {
  const header = headers.get("content-length");
  if (header === null || headers.has("transfer-encoding")) return undefined;

  const values = new Set(header.split(",").map((value) => value.trim()));
  const [value] = values;
  if (values.size !== 1 || value === undefined || !DIGITS.test(value)) {
    throw new BodyError("BODY_MALFORMED", "Content-Length is not a length in bytes");
  }
  /* A length past what a number holds exactly is past every limit too. */
  return Number(value);
}
