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
 * Global logger — pass context as first argument.
 *
 * @example
 * ```ts
 * logger.warn("Studio", "File watcher failed to emit scan update");
 * ```
 */
export const logger: Logger = {
  debug: (ctx, msg) => impl.debug(ctx, msg),
  info: (ctx, msg) => impl.info(ctx, msg),
  warn: (ctx, msg) => impl.warn(ctx, msg),
  error: (ctx, msg) => impl.error(ctx, msg),
};

export type { Logger, LogLevel } from "./types";
