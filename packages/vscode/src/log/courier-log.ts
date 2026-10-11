import * as vscode from "vscode";

let channel: vscode.LogOutputChannel | undefined;
/* The last failure each source of failures logged: one said again goes to the trace level, not the warnings. */
const lastFailures = new Map<string, string>();

/**
 * Courier's log, in the Output panel: made when first written to.
 *
 * @returns The log
 * @example
 * ```ts
 * courierLog().info("Studio answers at http://localhost:6280");
 * ```
 */
export function courierLog(): vscode.LogOutputChannel {
  channel ??= vscode.window.createOutputChannel("Courier", { log: true });
  return channel;
}

/**
 * Log what failed and why, as a warning — or, when the same failure was
 * the last one logged for it, at the trace level, so that a Studio asked
 * every few seconds while it is down does not flood the log.
 *
 * @param what - What failed, in words: "Studio at … did not list its requests"
 * @param error - Why
 * @example
 * ```ts
 * logFailure(`Studio at ${studio} did not list its requests`, error);
 * ```
 */
export function logFailure(what: string, error: unknown): void {
  const message = `${what}: ${error instanceof Error ? error.message : String(error)}`;
  if (lastFailures.get(what) === message) {
    courierLog().trace(message);
    return;
  }
  lastFailures.set(what, message);
  courierLog().warn(message);
}

/**
 * A handler for a promise's failure that logs it and answers with what
 * stands in for the result: an empty list, or nothing.
 *
 * @param what - What failed, in words
 * @param fallback - What stands in for the result
 * @returns The handler
 * @example
 * ```ts
 * const sites = await fetchSites(studio, source, endpoint).catch(loggedAs("…", []));
 * ```
 */
export function loggedAs<TFallback>(
  what: string,
  fallback: TFallback,
): (error: unknown) => TFallback {
  return (error) => {
    logFailure(what, error);
    return fallback;
  };
}

/**
 * Close the log, when the extension stops.
 *
 * @example
 * ```ts
 * context.subscriptions.push({ dispose: closeCourierLog });
 * ```
 */
export function closeCourierLog(): void {
  channel?.dispose();
  channel = undefined;
  lastFailures.clear();
}
