import { CourierError } from "@noverax/courier";
import { CONFIG_BASENAMES } from "@noverax/courier-studio-core/config";
import type { ProjectInputs } from "./read-project-inputs";

export type ConfigLoaderErrorCode =
  | "CONFIG_NOT_FOUND"
  | "CONFIG_INVALID"
  | "CONFIG_SOURCE_KEY_MISMATCH"
  | "CONFIG_LOAD_TIMEOUT"
  | "CONFIG_WATCHER_STOPPED";

/** What a `ConfigLoaderError` carries besides its code and message. */
export interface ConfigLoaderErrorOptions {
  cause?: unknown;
  context?: Record<string, unknown>;
  /** Every file the failed load read before evaluating, with the hash of what it read. */
  depHashes?: ProjectInputs;
}

/** Thrown by `loadCourierConfig` when something is wrong with the user config */
export class ConfigLoaderError extends CourierError<ConfigLoaderErrorCode> {
  /**
   * Every file the load read before it failed, with the hash of what it
   * read — so fixing any of them, a module that threw included, can be
   * noticed. Absent when the load failed before it read any.
   */
  readonly depHashes?: ProjectInputs;
  /** What a route answers with when this ends a request: Studio stopping is no failure of it. */
  readonly httpStatus?: number;

  constructor(
    code: ConfigLoaderErrorCode,
    message: string,
    { depHashes, ...options }: ConfigLoaderErrorOptions = {},
  ) {
    super(message, { code, ...options });
    if (depHashes !== undefined) this.depHashes = depHashes;
    if (code === "CONFIG_WATCHER_STOPPED") this.httpStatus = 503;
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
