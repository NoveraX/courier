import { scopeName } from "./scope-name";
import { serializeError } from "./serialize-error";
import type { LogLevel } from "./types";

/**
 * One log line as JSON, for a log pipeline to read: the time in ISO 8601,
 * the level, the scope, the process id where there is one, the message, and
 * the error behind it with its stack and cause chain.
 *
 *   {"time":"2026-10-04T16:03:59.120Z","level":"warn","scope":"proxy","pid":4120,
 *    "message":"Upstream request failed","error":{"name":"TypeError",…}}
 *
 * @param level - The line's level
 * @param context - What wrote it
 * @param message - The text
 * @param cause - The error behind it, if any
 * @returns The line, on one line
 * @example
 * ```ts
 * console.warn("%s", jsonLine("warn", "Proxy", "Upstream request failed", error));
 * ```
 */
export function jsonLine(
  level: LogLevel,
  context: string,
  message: string,
  cause?: unknown,
): string {
  const pid = globalThis.process?.pid;
  return JSON.stringify({
    time: new Date().toISOString(),
    level,
    scope: scopeName(context),
    ...(pid === undefined ? {} : { pid }),
    message,
    ...(cause == null ? {} : { error: serializeError(cause) }),
  });
}
