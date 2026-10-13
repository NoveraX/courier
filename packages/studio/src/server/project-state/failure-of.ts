import { ConfigLoaderError } from "../config-loader-errors";
import { describeError } from "../describe-error";
import type { ConfigFailure } from "./types";

/**
 * Describe a failed load of the config for the UI, the mock wizard and the log.
 * Every page is told it in `config:status`, one without the project's token
 * too, so the message names no path as it is on this machine: a path in the
 * project is named relative to it, any other from `~` or `<temp>`.
 *
 * @param error - What the load threw
 * @param root - The project root, symlinks resolved, that paths are shown relative to
 * @param at - When the load failed, in epoch milliseconds
 * @returns The failure, with the loader's code and a one-line message
 *
 * @example
 * ```ts
 * failureOf(new ConfigNotFoundError(root), root).code; // → "CONFIG_NOT_FOUND"
 * ```
 */
export function failureOf(error: unknown, root: string, at: number = Date.now()): ConfigFailure {
  const code = error instanceof ConfigLoaderError ? error.code : "UNKNOWN";
  return { code, message: describeError(error, root), at, cause: error };
}
