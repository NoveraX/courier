/**
 * Base error class for every error thrown from `@noverax/courier` packages.
 *
 * `TCode` is the type of the discriminator stored on `.code`. Subclasses pick
 * a literal string union (e.g. `ConfigurationErrorCode`) or a numeric union
 * (`RealtimeError` uses WebSocket close codes) to expose a stable, narrowed
 * field for programmatic handling.
 *
 * @example
 * ```ts
 * try {
 *   loadCourierConfig(cwd);
 * } catch (err) {
 *   if (err instanceof CourierError && err.code === "CONFIG_NOT_FOUND") {
 *     // ...remediation
 *   }
 * }
 * ```
 */
export interface CourierErrorOptions<TCode> {
  /** Stable discriminator string or number for programmatic handling */
  code: TCode;
  /** Underlying cause — chained via the standard `Error.cause` property (Node 16+) */
  cause?: unknown;
  /** Structured context for logging — never put secrets here */
  context?: Record<string, unknown>;
}

export class CourierError<TCode = string> extends Error {
  readonly code: TCode;
  readonly context?: Record<string, unknown>;

  constructor(message: string, options: CourierErrorOptions<TCode>) {
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = new.target.name;
    this.code = options.code;
    if (options.context !== undefined) this.context = options.context;
  }
}

/** Type guard for `CourierError` and any subclass */
export function isCourierError(error: unknown): error is CourierError {
  return error instanceof CourierError;
}
