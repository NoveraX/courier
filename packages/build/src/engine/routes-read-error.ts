import { CourierError } from "@noverax/courier";

/** Why a project's routes were not read. */
export type RoutesReadErrorCode =
  /** No `courier.config.*` is in the project's root or a folder above it. */
  | "CONFIG_NOT_FOUND"
  /** The config did not load: an import it could not resolve, a throw, or no `sources` in it. */
  | "CONFIG_NOT_LOADED"
  /** The reading went past its time limit, or its process ended before it answered. */
  | "ROUTES_NOT_READ";

/** Where a reading of the routes failed. */
export interface RoutesReadErrorContext extends Record<string, unknown> {
  /** The project's root the config was looked for from. */
  root: string;
  /** The config file, once one was found. */
  configFile?: string | undefined;
}

/**
 * A project's routes could not be read from its config. A build fails with
 * it; a dev server keeps the routes it read last and reports it.
 *
 * @example
 * ```ts
 * throw new RoutesReadError("CONFIG_NOT_FOUND", "No courier.config.* in /app or above it", { root: "/app" });
 * ```
 */
export class RoutesReadError extends CourierError<RoutesReadErrorCode> {
  declare readonly context: RoutesReadErrorContext;

  /**
   * @param code - Why the routes were not read
   * @param message - What went wrong, and what to do about it
   * @param context - The project's root, and the config file once found
   * @param stack - The stack of the error the config's own code threw, when it threw one
   */
  constructor(
    code: RoutesReadErrorCode,
    message: string,
    context: RoutesReadErrorContext,
    stack?: string,
  ) {
    super(message, { code, context });
    if (stack !== undefined) this.stack = stack;
  }
}
