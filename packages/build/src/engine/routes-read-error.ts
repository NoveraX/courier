import { CourierError } from "@noverax/courier";

import type { RoutesInputs } from "./routes-snapshot";

/** Why a project's routes were not read. */
export type RoutesReadErrorCode =
  /** No `courier.config.*` is in the project's root or a folder above it, up to the top of the project. */
  | "CONFIG_NOT_FOUND"
  /**
   * The nearest config lies in a folder above the root, and someone else
   * could have put it there, so it was not run.
   */
  | "CONFIG_NOT_TRUSTED"
  /** The config did not load: an import it could not resolve, a throw, or no `sources` in it. */
  | "CONFIG_NOT_LOADED"
  /** The reading went past its time limit, or its process ended before it answered. */
  | "ROUTES_NOT_READ"
  /**
   * `@noverax/courier` does not resolve from the project's root, so there is
   * no routes module of the package's to build the routes in place of.
   */
  | "CORE_NOT_FOUND";

/** Where a reading of the routes failed. */
export interface RoutesReadErrorContext extends Record<string, unknown> {
  /** The project's root the config was looked for from. */
  root: string;
  /** The config file, once one was found. */
  configFile?: string | undefined;
}

/** What a failed reading leaves besides its reason. */
export interface RoutesReadErrorDetails {
  /** The stack of the error the config's own code threw, when it threw one. */
  stack?: string | undefined;
  /**
   * What the reading had read when it failed: a change to any of it may mend
   * the config, and a watcher follows them. None when the reading never
   * answered.
   */
  inputs?: RoutesInputs | undefined;
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
  /** What the reading had read when it failed, when it answered at all. */
  readonly inputs: RoutesInputs | undefined;

  /**
   * @param code - Why the routes were not read
   * @param message - What went wrong, and what to do about it
   * @param context - The project's root, and the config file once found
   * @param details - The stack of what the config threw, and what the reading had read
   */
  constructor(
    code: RoutesReadErrorCode,
    message: string,
    context: RoutesReadErrorContext,
    { stack, inputs }: RoutesReadErrorDetails = {},
  ) {
    super(message, { code, context });
    if (stack !== undefined) this.stack = stack;
    this.inputs = inputs;
  }
}
