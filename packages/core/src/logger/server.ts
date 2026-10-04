/**
 * Terminal logger — Node, Bun, Deno and edge runtimes.
 *
 * Output format:
 *   HH:MM:SS ● courier:scope  message
 *
 * `debug` and `info` go to stdout, `warn` and `error` to stderr. A cause is
 * printed under the line as the runtime's console prints an error — its
 * stack, its `cause` chain, an AggregateError's errors and properties such as
 * `code` and `port`. `COURIER_LOG_LEVEL` (`debug`, `info`, `warn`, `error`,
 * `silent`; default `info`) sets the lowest level printed, and
 * `COURIER_LOG_FORMAT=json` writes each line as one JSON object instead.
 * Colour and symbols are for a terminal, following `FORCE_COLOR`, `NO_COLOR`
 * and `TERM=dumb` as the console does for the cause; a pipe or a log file
 * gets plain text with the level as a word.
 */

import { styleFor } from "../terminal/style-for";
import { formatLine } from "./format-line";
import { jsonLine } from "./json-line";
import { readLogFormat } from "./log-format";
import { rankOf, readThreshold } from "./threshold";
import type { Logger, LogLevel } from "./types";

/** The deepest level of a `cause` chain the console shows in full. */
const INSPECTED_DEPTH = 2;
const MAX_CHAIN = 32;

/* Each unknown setting is reported once, not on every line. */
const reported = new Set<string>();

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

function emit(
  level: LogLevel,
  context: string,
  message: string,
  cause: unknown,
  json: boolean,
): void {
  if (json) {
    console[level]("%s", jsonLine(level, context, message, cause));
    return;
  }
  const proc = globalThis.process;
  const stream = level === "warn" || level === "error" ? proc?.stderr : proc?.stdout;
  /* The line goes in as a `%s` argument, so a `%` in the message stays
     literal and cannot swallow the cause that follows it; the cause starts
     on a line of its own. */
  const line = formatLine(level, context, message, styleFor(stream));
  if (cause == null) {
    console[level]("%s", line);
    return;
  }
  const root = hiddenRootCause(cause);
  if (root === undefined) console[level]("%s\n%O", line, cause);
  else console[level]("%s\n%O\nroot cause: %O", line, cause, root);
}

/* An unknown COURIER_LOG_LEVEL or COURIER_LOG_FORMAT is named once, then the
   default stands. */
function reportOnce(message: string, json: boolean): void {
  if (reported.has(message)) return;
  reported.add(message);
  emit("warn", "Logger", message, undefined, json);
}

function write(level: LogLevel, context: string, message: string, cause?: unknown): void {
  const threshold = readThreshold();
  const format = readLogFormat();
  if (threshold.unrecognised !== undefined) {
    reportOnce(
      `COURIER_LOG_LEVEL="${threshold.unrecognised}" is not one of debug, info, warn, error, silent; using info`,
      format.json,
    );
  }
  if (format.unrecognised !== undefined && rankOf("warn") >= threshold.rank) {
    reportOnce(
      `COURIER_LOG_FORMAT="${format.unrecognised}" is not one of text, json; using text`,
      format.json,
    );
  }
  if (rankOf(level) < threshold.rank) return;
  emit(level, context, message, cause, format.json);
}

export const serverLogger: Logger = {
  debug: (ctx, msg, cause) => write("debug", ctx, msg, cause),
  info: (ctx, msg, cause) => write("info", ctx, msg, cause),
  warn: (ctx, msg, cause) => write("warn", ctx, msg, cause),
  error: (ctx, msg, cause) => write("error", ctx, msg, cause),
};
