import { maskedError } from "../config/load-error/without-secrets";
import { RoutesReadError, type RoutesReadErrorContext } from "./routes-read-error";
import type { RoutesInputs } from "./routes-snapshot";

/**
 * Why a reading of the routes failed, as a `RoutesReadError` whatever it
 * threw. The engine's own failure is kept as it is, its text the engine's
 * words and what the loader quoted of the project, masked already. Anything
 * else came from the project's code, a getter of its config or a source the
 * core read, and is `CONFIG_NOT_LOADED`, its text and stack with no secret
 * left in them: a bundler prints them, shows them on the page, and a CI
 * log, which may be public, keeps them.
 *
 * @param thrown - What the reading threw
 * @param context - The project's root, and the config file once found
 * @param inputs - What the reading had read, for a failure that names none yet
 * @returns The failure
 * @example
 * ```ts
 * readingFailure(new Error(`bad ${process.env.API_KEY}`), { root: "/app" }).message;
 * // → "The routes a page takes were not read: bad [redacted]"
 * ```
 */
export function readingFailure(
  thrown: unknown,
  context: RoutesReadErrorContext,
  inputs?: RoutesInputs,
): RoutesReadError {
  if (thrown instanceof RoutesReadError) {
    if (thrown.inputs !== undefined || inputs === undefined) return thrown;
    return new RoutesReadError(thrown.code, thrown.message, thrown.context, {
      stack: thrown.stack,
      inputs,
    });
  }
  const masked = maskedError(thrown);
  return new RoutesReadError(
    "CONFIG_NOT_LOADED",
    `The routes a page takes were not read: ${masked.message}`,
    context,
    { stack: thrown instanceof Error ? masked.stack : undefined, inputs },
  );
}
