import { CourierError } from "@noverax/courier";
import type { ConfigFailure } from "./types";

/**
 * Why Studio cannot answer from the project it runs.
 *
 * - `STUDIO_STARTING` — the first load of courier.config has had no outcome yet.
 * - `CONFIG_RELOADING` — a load or an edit is still under way.
 * - `CONFIG_NOT_LOADING` — courier.config fails to load.
 * - `CONFIG_MISSING` — there is no courier.config.
 */
export type ProjectUnavailableCode =
  | "STUDIO_STARTING"
  | "CONFIG_RELOADING"
  | "CONFIG_NOT_LOADING"
  | "CONFIG_MISSING";

/* Waiting is enough for the first two; the user has to change the project for the others. */
const HTTP_STATUS: Readonly<Record<ProjectUnavailableCode, 503 | 409>> = {
  STUDIO_STARTING: 503,
  CONFIG_RELOADING: 503,
  CONFIG_NOT_LOADING: 409,
  CONFIG_MISSING: 409,
};

/**
 * A request Studio will not answer from the project it runs right now, with
 * what the user can do about it. A route sends it as `{ error, code }` with
 * its `httpStatus`: 503 when trying again shortly may succeed, 409 when the
 * project has to change first.
 *
 * @example
 * ```ts
 * if (err instanceof ProjectUnavailableError) res.status(err.httpStatus).json({ error: err.message, code: err.code });
 * ```
 */
export class ProjectUnavailableError extends CourierError<ProjectUnavailableCode> {
  /** 503 when asking again shortly may succeed; 409 when the project has to change first. */
  readonly httpStatus: 503 | 409;

  /**
   * @param code - Why Studio cannot answer
   * @param message - What is wrong, and what to do
   * @param cause - What made the config fail, when it did
   */
  constructor(code: ProjectUnavailableCode, message: string, cause?: unknown) {
    super(message, { code, cause });
    this.httpStatus = HTTP_STATUS[code];
  }

  /**
   * The refusal while the first load of courier.config has had no outcome.
   *
   * @returns The error, 503
   */
  static starting(): ProjectUnavailableError {
    return new ProjectUnavailableError(
      "STUDIO_STARTING",
      "Studio is still loading courier.config; try again in a moment.",
    );
  }

  /**
   * The refusal while a load or an edit of courier.config is still under way.
   *
   * @returns The error, 503
   */
  static reloading(): ProjectUnavailableError {
    return new ProjectUnavailableError(
      "CONFIG_RELOADING",
      "Studio is still reloading courier.config after a change; try again in a moment.",
    );
  }

  /**
   * The refusal while courier.config fails to load.
   *
   * @param failure - Why the latest load failed
   * @returns The error, 409
   */
  static notLoading(failure: ConfigFailure): ProjectUnavailableError {
    return new ProjectUnavailableError(
      "CONFIG_NOT_LOADING",
      `courier.config does not load right now (${failure.message}), so Studio cannot tell ` +
        "which imports it declares. Fix courier.config and try again.",
      failure.cause,
    );
  }

  /**
   * The refusal while there is no courier.config.
   *
   * @param root - The project root the config belongs in
   * @returns The error, 409
   */
  static missing(root: string): ProjectUnavailableError {
    return new ProjectUnavailableError(
      "CONFIG_MISSING",
      `There is no courier.config in ${root}, so Studio cannot tell which imports it declares. ` +
        "Create courier.config.ts first, then try again.",
    );
  }
}
