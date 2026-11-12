import { maskedError } from "@noverax/courier-build/config";

import { ConfigLoaderError } from "../config-loader-errors";
import { describeError } from "../describe-error";
import type { ConfigFailure } from "./types";

/**
 * Describe a failed load of the config for the UI, the mock wizard and the log.
 * Every page is told it in `config:status`, one without the project's token
 * too, so the message names no path as it is on this machine: a path in the
 * project is named relative to it, any other from `~` or `<temp>`.
 *
 * The error kept for the log holds no secret either. The loader's own is
 * kept as it is: what it quotes of the project is masked already. Anything
 * else — what a getter of the config threw as Studio read it — is masked as
 * the loader masks what it quotes, its name, `code` and stack kept.
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
  if (error instanceof ConfigLoaderError) {
    return { code: error.code, message: describeError(error, root), at, cause: error };
  }
  return { code: "UNKNOWN", message: describeError(error, root), at, cause: maskedError(error) };
}
