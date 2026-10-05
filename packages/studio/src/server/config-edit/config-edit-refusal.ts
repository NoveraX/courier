import { CourierError } from "@noverax/courier";

/** Why Studio leaves declaring an import in the config to the developer. */
export type ConfigEditRefusalCode =
  /** The config does not parse, is not UTF-8, or is not a regular file. */
  | "CONFIG_UNREADABLE"
  /** Its default export is not an object Studio can find and add to. */
  | "CONFIG_SHAPE"
  /** `sources` or `imports` is not an object literal Studio can add to. */
  | "LIST_SHAPE"
  /** The name the generated source is imported under is taken in the config. */
  | "NAME_IN_USE"
  /** The config changed after the change was shown. */
  | "CONFIG_CHANGED"
  /** The planned text did not read back as the declaration it was meant to be. */
  | "PLAN_REJECTED"
  /** The config does not load as it is on disk, or did not load once changed. */
  | "NOT_LOADED"
  /** Studio could not write the config. */
  | "WRITE_FAILED"
  /** Studio was still loading the config when the change was asked for. */
  | "STUDIO_BUSY"
  /** The request came from elsewhere than a browser on this machine. */
  | "NOT_LOCAL_PEER";

/**
 * Studio leaves the declaration to the developer: the config is written in
 * a way it cannot add to safely, changed under it, or did not load once
 * changed. The message says why in words a developer can act on; the code
 * says which case it is.
 *
 * @example
 * ```ts
 * throw new ConfigEditRefusal("LIST_SHAPE", "courier.config.ts builds `sources` in a way Studio cannot add to.");
 * ```
 */
export class ConfigEditRefusal extends CourierError<ConfigEditRefusalCode> {
  /**
   * @param code - Which case it is
   * @param message - Why, for the developer
   * @param options - The error that led to it, when there is one
   */
  constructor(code: ConfigEditRefusalCode, message: string, options: { cause?: unknown } = {}) {
    super(message, { code, cause: options.cause });
  }
}
