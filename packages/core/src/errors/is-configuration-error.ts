import { ConfigurationError } from "./configuration-error";

/**
 * Whether an error is a `ConfigurationError`. Apart from the class, which an
 * API's definition throws: a page of definitions alone loads no guard a
 * call's failure is told by.
 *
 * @param error - What was thrown
 * @returns Whether Courier refused its configuration
 * @example
 * ```ts
 * if (isConfigurationError(error) && error.code === "PROXY_PATH_INVALID") showSetupHint();
 * ```
 */
export function isConfigurationError(error: unknown): error is ConfigurationError {
  return error instanceof ConfigurationError;
}
