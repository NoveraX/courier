import { CourierError } from "@noverax/courier";

export type ConfigLoaderErrorCode =
  | "CONFIG_NOT_FOUND"
  | "CONFIG_INVALID"
  | "CONFIG_SOURCE_KEY_MISMATCH";

/** Thrown by `loadCourierConfig` when something is wrong with the user config */
export class ConfigLoaderError extends CourierError<ConfigLoaderErrorCode> {
  constructor(
    code: ConfigLoaderErrorCode,
    message: string,
    options: { cause?: unknown; context?: Record<string, unknown> } = {},
  ) {
    super(message, { code, ...options });
  }
}

/** Thrown specifically when no `courier.config.{ts,js,mjs}` exists in the project root */
export class ConfigNotFoundError extends ConfigLoaderError {
  constructor(cwd: string) {
    super(
      "CONFIG_NOT_FOUND",
      `No courier.config.{ts,js,mjs} found in ${cwd}. Run \`courier init\` to scaffold one.`,
      { context: { cwd } },
    );
  }
}
