/**
 * Base error class for every error thrown from `@noverax/nexus` packages.
 *
 * `TCode` is the type of the discriminator stored on `.code`. Subclasses pick
 * a literal string union (e.g. `ConfigurationErrorCode`) or a numeric union
 * (`RealtimeError` uses WebSocket close codes) to expose a stable, narrowed
 * field for programmatic handling.
 *
 * @example
 * ```ts
 * try {
 *   loadNexusConfig(cwd);
 * } catch (err) {
 *   if (err instanceof NexusError && err.code === "CONFIG_NOT_FOUND") {
 *     // ...remediation
 *   }
 * }
 * ```
 */
export interface NexusErrorOptions<TCode> {
  /** Stable discriminator string or number for programmatic handling */
  code: TCode;
  /** Underlying cause — chained via the standard `Error.cause` property (Node 16+) */
  cause?: unknown;
  /** Structured context for logging — never put secrets here */
  context?: Record<string, unknown>;
}

export class NexusError<TCode = string> extends Error {
  readonly code: TCode;
  readonly context?: Record<string, unknown>;

  constructor(message: string, options: NexusErrorOptions<TCode>) {
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = new.target.name;
    this.code = options.code;
    if (options.context !== undefined) this.context = options.context;
  }
}

/** Type guard for `NexusError` and any subclass */
export function isNexusError(error: unknown): error is NexusError {
  return error instanceof NexusError;
}
