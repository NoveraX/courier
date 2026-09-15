import { NexusError } from "@noverax/nexus";

export type ConfigLoaderErrorCode =
  | "CONFIG_NOT_FOUND"
  | "CONFIG_INVALID"
  | "CONFIG_SOURCE_KEY_MISMATCH";

/** Thrown by `loadNexusConfig` when something is wrong with the user config */
export class ConfigLoaderError extends NexusError<ConfigLoaderErrorCode> {
  constructor(
    code: ConfigLoaderErrorCode,
    message: string,
    options: { cause?: unknown; context?: Record<string, unknown> } = {},
  ) {
    super(message, { code, ...options });
  }
}

/** Thrown specifically when no `nexus.config.{ts,js,mjs}` exists in the project root */
export class ConfigNotFoundError extends ConfigLoaderError {
  constructor(cwd: string) {
    super(
      "CONFIG_NOT_FOUND",
      `No nexus.config.{ts,js,mjs} found in ${cwd}. Run \`nexus init\` to scaffold one.`,
      { context: { cwd } },
    );
  }
}
