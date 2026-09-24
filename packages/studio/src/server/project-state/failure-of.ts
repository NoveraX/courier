import { ConfigLoaderError } from "../config-loader-errors";
import { describeError } from "../describe-error";
import type { ConfigFailure } from "./types";

/**
 * Describe a failed load of the config for the UI, the mock wizard and the log.
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
