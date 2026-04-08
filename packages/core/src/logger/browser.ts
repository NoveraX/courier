/**
 * Browser logger — CSS-styled console output with brand colors.
 *
 * Output format:
 *   [Nexus] [Context] message
 *   with purple badge, colored context, and styled message
 */

import type { Logger, LogLevel } from "./types";

const BADGE_STYLE = [
  "background: #7C3AED; color: #fff; font-weight: 700",
  "padding: 1px 6px; border-radius: 3px; font-size: 11px",
].join("; ");

const CONTEXT_STYLES: Record<LogLevel, string> = {
  debug: "color: #71717A; font-weight: 600",
  info: "color: #A78BFA; font-weight: 600",
  warn: "color: #FBBF24; font-weight: 600",
  error: "color: #F87171; font-weight: 600",
};

const MSG_STYLE = "color: inherit; font-weight: 400";

const CONSOLE_METHOD: Record<LogLevel, "debug" | "log" | "warn" | "error"> = {
  debug: "debug",
  info: "log",
  warn: "warn",
  error: "error",
};

function log(level: LogLevel, context: string, message: string, cause?: unknown): void {
  const method = CONSOLE_METHOD[level];
  const args: unknown[] = [
    `%c Nexus %c %c${context}%c ${message}`,
    BADGE_STYLE,
    "",
    CONTEXT_STYLES[level],
    MSG_STYLE,
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
