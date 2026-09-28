import { CourierError } from "@noverax/courier";

/**
 * The URL an import is fetched from answered with something Studio cannot
 * read as a specification — a page, an error body, JSON of another shape.
 * The host answered, so the failure is its own: answered 502.
 *
 * @example
 * ```ts
 * throw new SpecUnreadableError("https://specs.example/pets.json", error);
 * ```
 */
export class SpecUnreadableError extends CourierError<"SPEC_UNREADABLE"> {
  /** The status a route answers with. */
  readonly httpStatus = 502;

  /**
   * @param url - The URL that answered
   * @param cause - What reading its answer failed with
   */
  constructor(url: string, cause: unknown) {
    const reason = cause instanceof Error ? cause.message : String(cause);
    super(`${url} did not answer with a specification Studio can read: ${reason}`, {
      code: "SPEC_UNREADABLE",
      cause,
      context: { url },
    });
  }
}
