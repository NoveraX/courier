import { CourierError } from "@noverax/courier";
import { CONFIG_BASENAMES } from "@noverax/courier-studio-core/config";

export type ConfigLoaderErrorCode =
  | "CONFIG_NOT_FOUND"
  | "CONFIG_INVALID"
  | "CONFIG_SOURCE_KEY_MISMATCH"
  | "CONFIG_LOAD_TIMEOUT"
  | "CONFIG_WATCHER_STOPPED";

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

/** Thrown specifically when no `courier.config.*` exists in the project root */
export class ConfigNotFoundError extends ConfigLoaderError {
  constructor(cwd: string) {
    super(
      "CONFIG_NOT_FOUND",
      `No ${CONFIG_BASENAMES.join(", ")} in ${cwd}. Create one there, or start Studio ` +
        "from the project root (or with --cwd). Sources your app registers at runtime " +
        "still show up without it.",
      { context: { cwd } },
    );
  }
}
