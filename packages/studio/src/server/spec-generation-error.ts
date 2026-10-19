import { CourierError } from "@noverax/courier";
import { ranOutOfStack } from "./ran-out-of-stack";

/**
 * A spec from a request could not be turned into code: a shape deeper than
 * the request's validation reaches is not what the parser gives, or schemas
 * nested deeper than the generator goes. Answered 400, naming what failed.
 *
 * @example
 * ```ts
 * throw new SpecGenerationError(error);
 * ```
 */
export class SpecGenerationError extends CourierError<"SPEC_NOT_GENERATED"> {
  /** The status a route answers with. */
  readonly httpStatus = 400;

  /**
   * @param cause - What the generator threw
   */
  constructor(cause: unknown) {
    const reason = ranOutOfStack(cause)
      ? "it nests its schemas deeper than Studio can generate code for"
      : cause instanceof Error
        ? cause.message
        : String(cause);
    super(`Studio could not generate code from this spec: ${reason}`, {
      code: "SPEC_NOT_GENERATED",
      cause,
    });
  }
}
