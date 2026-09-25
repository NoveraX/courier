import { CourierError } from "@noverax/courier";
import type { ConfigFailure } from "./project-state/types";

/**
 * Why Studio cannot tell whether the project allows a private spec host.
 *
 * - `STUDIO_STARTING` — the first load of courier.config has had no outcome yet.
 * - `CONFIG_RELOADING` — a load or an edit is still under way.
 * - `CONFIG_NOT_LOADING` — courier.config fails to load.
 */
export type SpecHostsUnavailableCode =
  | "STUDIO_STARTING"
  | "CONFIG_RELOADING"
  | "CONFIG_NOT_LOADING";

/* Waiting is enough for the first two; the user has to fix courier.config for the last. */
const HTTP_STATUS: Readonly<Record<SpecHostsUnavailableCode, 503 | 409>> = {
  STUDIO_STARTING: 503,
  CONFIG_RELOADING: 503,
  CONFIG_NOT_LOADING: 409,
};

const RULE = "Studio reaches a private host only when `studio.allowedSpecHosts` names it";

/**
 * A request for a private address, refused because Studio cannot read
 * `studio.allowedSpecHosts` right now. It fails closed: while courier.config
 * does not load, no private host is reached, not even one the last config
 * that loaded named — a save that removed a host and broke the config would
 * otherwise keep that host allowed for as long as the config stays broken.
 * A route sends it as `{ error, code }` with its `httpStatus`.
 *
 * @example
 * ```ts
 * if (err instanceof SpecHostsUnavailableError) res.status(err.httpStatus).json({ error: err.message, code: err.code });
 * ```
 */
export class SpecHostsUnavailableError extends CourierError<SpecHostsUnavailableCode> {
  /** 503 when asking again shortly may succeed; 409 when courier.config has to be fixed first. */
  readonly httpStatus: 503 | 409;

  /**
   * @param code - Why Studio cannot read the list
   * @param message - What was refused, why, and what to do
   * @param cause - What made the config fail, when it did
   */
  constructor(code: SpecHostsUnavailableCode, message: string, cause?: unknown) {
    super(message, { code, cause });
    this.httpStatus = HTTP_STATUS[code];
  }

  /**
   * The refusal while courier.config fails to load.
   *
   * @param what - The host, and the address it resolved to when there was a lookup
   * @param failure - Why the latest load failed
   * @returns The error, 409
   */
  static notLoading(what: string, failure: ConfigFailure): SpecHostsUnavailableError {
    return new SpecHostsUnavailableError(
      "CONFIG_NOT_LOADING",
      `Blocked request to private address: ${what}. ${RULE}, and courier.config does not load right now (${failure.message}), so Studio cannot read that list. Fix courier.config and try again.`,
      failure.cause,
    );
  }

  /**
   * The refusal while the first load of courier.config has had no outcome.
   *
   * @param what - The host, and the address it resolved to when there was a lookup
   * @returns The error, 503
   */
  static starting(what: string): SpecHostsUnavailableError {
    return new SpecHostsUnavailableError("STUDIO_STARTING", stillLoading(what));
  }

  /**
   * The refusal while a load or an edit of courier.config is still under way.
   *
   * @param what - The host, and the address it resolved to when there was a lookup
   * @returns The error, 503
   */
  static reloading(what: string): SpecHostsUnavailableError {
    return new SpecHostsUnavailableError("CONFIG_RELOADING", stillLoading(what));
  }
}

function stillLoading(what: string): string {
  return `Blocked request to private address: ${what}. ${RULE}, and courier.config is still loading, so Studio cannot tell yet; try again in a moment.`;
}
