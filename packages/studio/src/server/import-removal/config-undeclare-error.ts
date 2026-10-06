import { CourierError } from "@noverax/courier";

/** Why a removal that was to take the import out of courier.config removed nothing. */
export type ConfigUndeclareErrorCode =
  /** The config changed since the user saw the change to it. */
  | "CONFIG_STALE"
  /** Studio could not make the change, and left the config as it was. */
  | "CONFIG_NOT_CHANGED";

/**
 * A removal asked to take the import out of courier.config, and Studio
 * could not: nothing was removed, and the config is as it was. The message
 * says why, for the user to look at the removal again.
 *
 * @example
 * ```ts
 * throw new ConfigUndeclareError("CONFIG_STALE", "courier.config.ts changed since you saw the change; look at it again.");
 * ```
 */
export class ConfigUndeclareError extends CourierError<ConfigUndeclareErrorCode> {
  /** Always 409: the config, or the project, has to change first. */
  readonly httpStatus = 409;

  /**
   * @param code - Which case it is
   * @param message - Why, and what to do
   */
  constructor(code: ConfigUndeclareErrorCode, message: string) {
    super(message, { code });
  }
}
