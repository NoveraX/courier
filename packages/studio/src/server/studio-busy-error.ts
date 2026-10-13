import { CourierError } from "@noverax/courier";

/**
 * Studio already does as much of some work at once as it takes — reading
 * specifications for callers without the project's token, say — and takes
 * no more until some of it ends. Asking again shortly may succeed, so a
 * route answers 503.
 *
 * @example
 * ```ts
 * if (!reads.take()) throw new StudioBusyError("Studio is reading as many specifications as it takes at once.");
 * ```
 */
export class StudioBusyError extends CourierError<"STUDIO_BUSY"> {
  /** The status a route answers with. */
  readonly httpStatus = 503;

  /**
   * @param message - What Studio is busy with, and that asking again later may work
   */
  constructor(message: string) {
    super(message, { code: "STUDIO_BUSY" });
  }
}
