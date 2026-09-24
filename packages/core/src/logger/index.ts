import { browserLogger } from "./browser";
import { serverLogger } from "./server";
import type { Logger } from "./types";

const isBrowser = typeof window !== "undefined" && typeof document !== "undefined";
const impl: Logger = isBrowser ? browserLogger : serverLogger;

/**
 * Scoped logger returned by {@link createLogger}.
 *
 * Unlike {@link Logger}, the context is bound at construction time so the
 * call site only passes a message (and optional cause). Useful when a module
 * wants to namespace every log line under the same prefix.
 */
export interface ScopedLogger {
  debug(message: string, cause?: unknown): void;
  info(message: string, cause?: unknown): void;
  warn(message: string, cause?: unknown): void;
  error(message: string, cause?: unknown): void;
}

/**
 * Scoped logger — binds a context name so every call includes it.
 *
 * On a server, `debug` and `info` go to stdout and `warn` and `error` to
 * stderr, each line prefixed with `[Courier]`, the process id and the time.
 * A cause passed as the second argument is printed after the line with its
 * stack and `cause` chain. `COURIER_LOG_LEVEL` — `debug`, `info` (default),
 * `warn`, `error` or `silent` — sets the lowest level printed; colour
 * follows the terminal, `NO_COLOR` and `FORCE_COLOR`. In a browser the lines
 * go to the devtools console, whose level filter applies instead.
 *
 * @param context - The name every line is prefixed with
 * @returns A logger for that context
 *
 * @example
 * ```ts
 * const log = createLogger("HttpClient");
 * log.warn("Cache option ignored with upload progress");
 * ```
 */
export function createLogger(context: string): ScopedLogger {
  return {
    debug: (msg, cause) => impl.debug(context, msg, cause),
    info: (msg, cause) => impl.info(context, msg, cause),
    warn: (msg, cause) => impl.warn(context, msg, cause),
    error: (msg, cause) => impl.error(context, msg, cause),
  };
}

/**
 * Global logger — pass context as first argument, and the error behind the
 * line, if any, as the third.
 *
 * @example
 * ```ts
 * logger.warn("Studio", "File watcher failed to emit scan update", err);
 * ```
 */
export const logger: Logger = {
  debug: (ctx, msg, cause) => impl.debug(ctx, msg, cause),
  info: (ctx, msg, cause) => impl.info(ctx, msg, cause),
  warn: (ctx, msg, cause) => impl.warn(ctx, msg, cause),
  error: (ctx, msg, cause) => impl.error(ctx, msg, cause),
};

export type { Logger, LogLevel } from "./types";
