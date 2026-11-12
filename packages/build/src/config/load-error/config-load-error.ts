import { CourierError } from "@noverax/courier";

/** Why a project's config — or its mocks file — did not load. */
export type ConfigLoadErrorCode =
  /** An import did not resolve: a package that is not installed, a path to no module. */
  | "MODULE_NOT_FOUND"
  /** An import the project's framework refuses where definitions run, such as Next's `client-only`. */
  | "MODULE_REFUSED"
  /** A module could not be compiled: its syntax. */
  | "TRANSFORM_FAILED"
  /** The project's code threw while it was run to read the config. */
  | "EVALUATION_FAILED"
  /** The load did not end within its time: a module waits for something that does not come. */
  | "LOAD_TIMED_OUT";

/** Where a load failed. */
export interface ConfigLoadErrorContext extends Record<string, unknown> {
  /** The file loaded, absolute: `courier.config.*` or `courier.mocks.*`. */
  readonly entry: string;
  /** The import that did not resolve or was refused, as written. */
  readonly specifier: string | undefined;
  /**
   * The modules from the entry to the one that failed, the entry first: each
   * of the project's by its absolute path, as the system names it — with `\`
   * on Windows — and an installed package by its name.
   */
  readonly importChain: readonly string[];
}

/**
 * A project's config, or its mocks file, did not load. The message says
 * what failed and in which module, with the chain of imports that led there
 * from the entry — `src/api.ts imports "server-only", which does not resolve
 * (courier.config.ts → src/api.ts).` — in one line; `hint` says what to do,
 * in another. Neither holds a secret: the project's own message is quoted
 * with the environment's values masked and every credential `redact()`
 * finds cut, each as `[redacted]`. What the project threw is the `cause`,
 * for a log at debug level, cut the same way in its message and its stack.
 *
 * @example
 * ```ts
 * if (error instanceof ConfigLoadError) log.error(`${error.message}\n${error.hint}`);
 * ```
 */
export class ConfigLoadError extends CourierError<ConfigLoadErrorCode> {
  declare readonly context: ConfigLoadErrorContext;
  /** What to do about it, in a sentence or two. */
  readonly hint: string;

  /**
   * @param code - Why the load failed
   * @param message - What failed and where, in one line
   * @param details - Where it failed, what to do, and what the project threw
   */
  constructor(
    code: ConfigLoadErrorCode,
    message: string,
    details: { context: ConfigLoadErrorContext; hint: string; cause?: unknown },
  ) {
    super(message, { code, context: details.context, cause: details.cause });
    this.hint = details.hint;
  }
}
