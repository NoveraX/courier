/**
 * Browser logger — CSS-styled console output with brand colors.
 *
 * Output format:
 *   [Courier] [Context] message
 *   with a badge in Courier's blue, a coloured context, and a styled message
 */

import type { Logger, LogLevel } from "./types";

const BADGE_STYLE = [
  "background: #1C63D6; color: #fff; font-weight: 700",
  "padding: 1px 6px; border-radius: 3px; font-size: 11px",
].join("; ");

/* A warning or an error row has its own colour in each DevTools theme; a
   fixed yellow or red on it was barely readable in the light theme, so
   their context takes the row's colour and stands out by its weight. */
const CONTEXT_STYLES: Record<LogLevel, string> = {
  debug: "color: #71717A; font-weight: 600",
  info: "color: #2E74EA; font-weight: 600",
  warn: "color: inherit; font-weight: 700",
  error: "color: inherit; font-weight: 700",
};

const MSG_STYLE = "color: inherit; font-weight: 400";

const CONSOLE_METHOD: Record<LogLevel, "debug" | "log" | "warn" | "error"> = {
  debug: "debug",
  info: "log",
  warn: "warn",
  error: "error",
};

/* Context and message go in as `%s` arguments, never into the format
   string: a `%c` or `%o` in text that came from a server would otherwise be
   read as a directive and consume the cause. */
function log(level: LogLevel, context: string, message: string, cause?: unknown): void {
  const method = CONSOLE_METHOD[level];
  const args: unknown[] = [
    "%c Courier %c %c%s%c %s",
    BADGE_STYLE,
    "",
    CONTEXT_STYLES[level],
    context,
    MSG_STYLE,
    message,
  ];
  if (cause != null) args.push(cause);
  console[method](...args);
}

export const browserLogger: Logger = {
  debug: (ctx, msg, cause) => log("debug", ctx, msg, cause),
  info: (ctx, msg, cause) => log("info", ctx, msg, cause),
  warn: (ctx, msg, cause) => log("warn", ctx, msg, cause),
  error: (ctx, msg, cause) => log("error", ctx, msg, cause),
};
