import { logger } from "@noverax/courier";
import type { ChildErrorCode } from "./types";

/** Why a mock did not start, and what kind of failure it was where Studio can act on it. */
export interface StartFailure {
  message: string;
  code?: ChildErrorCode;
}

/**
 * The reason a mock did not start, as Studio shows it on the mock's status
 * and in its terminal: one line, never a stack trace through the mock's own
 * bundle. A port another process holds is said in those words; any other
 * failure gives its message, and its stack goes to the worker's log, which
 * reaches Studio's terminal too. A port in use is coded, so Studio can move
 * a mock whose port it assigned to the next free one.
 *
 * @param error - What the start rejected with
 * @returns The reason to report, and its code
 * @example
 * ```ts
 * start().catch((error: unknown) => {
 *   const { message, code } = startFailure(error);
 *   sendError(message, true, code);
 * });
 * ```
 */
export function startFailure(error: unknown): StartFailure {
  const port = portInUse(error);
  if (port !== undefined) {
    return { message: `Port ${port} is in use by another process.`, code: "PORT_IN_USE" };
  }
  logger.error("MockWorker", "The mock did not start", error);
  return { message: error instanceof Error ? error.message : String(error) };
}

/** The port an EADDRINUSE error names, when it is one */
function portInUse(error: unknown): number | undefined {
  if (!(error instanceof Error) || !("code" in error) || error.code !== "EADDRINUSE") {
    return undefined;
  }
  return "port" in error && typeof error.port === "number" ? error.port : undefined;
}
