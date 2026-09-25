import { ConfigLoaderError } from "./config-loader-errors";
import { formatDuration } from "./format-duration";
import { CONFIG_LOAD_TIMEOUT_VARIABLE } from "./project-state/budgets";
import type { ProjectInputs } from "./read-project-inputs";

/**
 * A load of the project Studio stopped waiting for, with code
 * `CONFIG_LOAD_TIMEOUT`. The load evaluates `courier.config` and then
 * `courier.mocks`, so the message names both: either one, or a module it
 * imports, may be what hangs. It also names the environment variable that
 * gives a slow project longer.
 *
 * @example
 * ```ts
 * throw new ConfigLoadTimeoutError(20_000, inputs);
 * // Loading courier.config, and courier.mocks when there is one, took longer than 20 s, …
 * ```
 */
export class ConfigLoadTimeoutError extends ConfigLoaderError {
  /**
   * @param timeoutMs - How long Studio waited
   * @param depHashes - What the load read before it evaluated anything, when
   *   it got that far; watching those files lets fixing the one that hangs
   *   reload the config
   */
  constructor(timeoutMs: number, depHashes?: ProjectInputs) {
    super(
      "CONFIG_LOAD_TIMEOUT",
      `Loading courier.config, and courier.mocks when there is one, took longer than ${formatDuration(timeoutMs)}, ` +
        "so Studio stopped waiting for it. To give it longer, start Studio with " +
        `${CONFIG_LOAD_TIMEOUT_VARIABLE} set to the milliseconds it needs.`,
      depHashes === undefined ? {} : { depHashes },
    );
  }
}
