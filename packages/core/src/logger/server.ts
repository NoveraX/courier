/**
 * Terminal logger — Node, Bun, Deno and edge runtimes.
 *
 * Output format:
 *   [Courier] PID - HH:MM:SS  LEVEL  [Context] message
 *
 * `debug` and `info` go to stdout, `warn` and `error` to stderr. A cause is
 * printed after the line as the runtime's console prints an error — its
 * stack, its `cause` chain, an AggregateError's errors and properties such as
 * `code` and `port`. `COURIER_LOG_LEVEL` (`debug`, `info`, `warn`, `error`,
 * `silent`; default `info`) sets the lowest level printed. The prefix is
 * coloured only on a terminal, following `FORCE_COLOR`, `NO_COLOR` and
 * `TERM=dumb` as the console does for the cause.
 */

import { shouldColorize } from "./colors";
import { formatLine } from "./format-line";
import { rankOf, readThreshold } from "./threshold";
import type { Logger, LogLevel } from "./types";

/** The deepest level of a `cause` chain the console shows in full. */
const INSPECTED_DEPTH = 2;
const MAX_CHAIN = 32;

const reportedLevels = new Set<string>();

/** Whether the console, past its inspect depth, prints this as `[Error]`. */
function collapses(value: unknown): boolean {
  return typeof value === "object" && value !== null && Object.keys(value).length > 0;
}

/**
 * The innermost cause of an error, when the console would cut it short.
 *
 * The console inspects a cause two levels deep. Below that, an error with
 * properties of its own — every system error has `code`, `errno`,
 * `address`, `port` — or with a cause prints as `[Error]`, and an
 * AggregateError's errors, which sit two levels below it, the same way. The
 * ECONNREFUSED at the bottom of a failed fetch, the one line that explains
 * it, would be lost. A chain that loops has no root; one the console shows
 * in full needs none.
 */
function hiddenRootCause(cause: unknown): Error | undefined {
  const seen = new Set<Error>();
  let current = cause;
  let depth = 0;
  while (current instanceof Error && current.cause instanceof Error) {
    if (seen.has(current) || depth >= MAX_CHAIN) return undefined;
    seen.add(current);
    current = current.cause;
    depth++;
  }
  if (!(current instanceof Error)) return undefined;
  /* Past the inspected depth an error with a `cause` of its own collapses
     too, so a root deeper than one level past it is always hidden. */
  if (current instanceof AggregateError) {
    const errorsHidden = depth >= INSPECTED_DEPTH;
    const membersHidden = depth === INSPECTED_DEPTH - 1 && current.errors.some(collapses);
    return errorsHidden || membersHidden ? current : undefined;
  }
  const hidden =
    depth > INSPECTED_DEPTH + 1 || (depth === INSPECTED_DEPTH + 1 && collapses(current));
  return hidden ? current : undefined;
}

function emit(level: LogLevel, context: string, message: string, cause?: unknown): void {
  const proc = globalThis.process;
  const stream = level === "warn" || level === "error" ? proc?.stderr : proc?.stdout;
  const line = formatLine(level, context, message, shouldColorize(stream));
  /* The line goes in as a `%s` argument, so a `%` in the message stays
     literal and cannot swallow the cause that follows it. */
  const details: unknown[] = cause == null ? [] : [cause];
  const root = hiddenRootCause(cause);
  if (root !== undefined) details.push("\nroot cause:", root);
  console[level]("%s", line, ...details);
}

function write(level: LogLevel, context: string, message: string, cause?: unknown): void {
  const threshold = readThreshold();
  if (threshold.unrecognised !== undefined && !reportedLevels.has(threshold.unrecognised)) {
    reportedLevels.add(threshold.unrecognised);
    emit(
      "warn",
      "Logger",
      `COURIER_LOG_LEVEL="${threshold.unrecognised}" is not one of debug, info, warn, error, silent; using info`,
    );
  }
  if (rankOf(level) < threshold.rank) return;
  emit(level, context, message, cause);
}

export const serverLogger: Logger = {
  debug: (ctx, msg, cause) => write("debug", ctx, msg, cause),
  info: (ctx, msg, cause) => write("info", ctx, msg, cause),
  warn: (ctx, msg, cause) => write("warn", ctx, msg, cause),
  error: (ctx, msg, cause) => write("error", ctx, msg, cause),
};
