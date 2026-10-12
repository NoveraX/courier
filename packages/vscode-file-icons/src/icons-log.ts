import * as vscode from "vscode";

let channel: vscode.LogOutputChannel | undefined;
/* The last failure each source of failures logged: one said again goes to the trace level, not the warnings. */
const lastFailures = new Map<string, string>();

/**
 * The log of Courier File Icons, in the Output panel: made when first
 * written to.
 *
 * @returns The log
 * @example
 * ```ts
 * iconsLog().info("Courier's icons went into vscode-icons, the icon theme in use");
 * ```
 */
export function iconsLog(): vscode.LogOutputChannel {
  channel ??= vscode.window.createOutputChannel("Courier File Icons", { log: true });
  return channel;
}

/**
 * Log what failed and why, as a warning — or, when the same failure was
 * the last one logged for it, at the trace level, so that one said again
 * at every start does not flood the log.
 *
 * @param what - What failed, in words: "Courier could not keep its file icons current"
 * @param error - Why
 * @example
 * ```ts
 * logFailure("Courier could not put its file icons in", error);
 * ```
 */
export function logFailure(what: string, error: unknown): void {
  const message = `${what}: ${error instanceof Error ? error.message : String(error)}`;
  if (lastFailures.get(what) === message) {
    iconsLog().trace(message);
    return;
  }
  lastFailures.set(what, message);
  iconsLog().warn(message);
}

/**
 * Close the log, when the extension stops.
 *
 * @example
 * ```ts
 * context.subscriptions.push({ dispose: closeIconsLog });
 * ```
 */
export function closeIconsLog(): void {
  channel?.dispose();
  channel = undefined;
  lastFailures.clear();
}
