import { CourierError } from "@noverax/courier";
import { MAX_MESSAGE_BYTES } from "./max-message-bytes";

const MB = 1024 * 1024;

/**
 * A parsed specification is larger than Studio takes back in a request.
 * Generating, writing, updating and managing an import all send the parsed
 * specification to Studio, so one it could not take back would parse and
 * then never be written — nor, on a public demo, have its code generated.
 * Answered 413.
 *
 * @example
 * ```ts
 * throw new SpecTooLargeError(80 * 1024 * 1024);
 * ```
 */
export class SpecTooLargeError extends CourierError<"SPEC_TOO_LARGE"> {
  /** The status a route answers with. */
  readonly httpStatus = 413;

  /**
   * @param bytes - The parsed specification's size as JSON
   * @param limit - The most its caller may send back (default {@link MAX_MESSAGE_BYTES})
   */
  constructor(bytes: number, limit: number = MAX_MESSAGE_BYTES) {
    super(
      `The specification is ${Math.ceil(bytes / MB)} MB once parsed; Studio imports one of at most ${Math.floor(limit / MB)} MB.`,
      { code: "SPEC_TOO_LARGE", context: { bytes } },
    );
  }
}
