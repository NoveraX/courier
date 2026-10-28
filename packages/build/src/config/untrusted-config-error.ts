import { CourierError } from "@noverax/courier";

/** Where a config that was not run lies, and the folder it was looked for from. */
export interface UntrustedConfigContext extends Record<string, unknown> {
  /** The config, absolute. */
  configFile: string;
  /** The folder the config was looked for from, below it. */
  folder: string;
}

/**
 * The config nearest a folder lies in a folder above it, and someone else
 * could have put it there: it belongs to another user, or any user may
 * write it. It was not run, as it would run with the rights of whoever
 * builds or serves the project.
 *
 * @example
 * ```ts
 * throw new UntrustedConfigError("/tmp/courier.config.ts", "/tmp/app", "it belongs to uid 1001");
 * ```
 */
export class UntrustedConfigError extends CourierError<"CONFIG_NOT_TRUSTED"> {
  declare readonly context: UntrustedConfigContext;

  /**
   * @param configFile - The config that was not run, absolute
   * @param folder - The folder it was looked for from
   * @param reason - Why it is not trusted, worded to follow "and"
   */
  constructor(configFile: string, folder: string, reason: string) {
    super(
      `${configFile} was not run: it lies above ${folder}, and ${reason}. A config in a folder above the project runs only when it is yours and no one else may change it; move it into the project, or name the project's own config.`,
      { code: "CONFIG_NOT_TRUSTED", context: { configFile, folder } },
    );
  }
}
