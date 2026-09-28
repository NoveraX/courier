import { logger } from "@noverax/courier";

/**
 * The reason a mock did not start, as Studio shows it on the mock's status
 * and in its terminal: one line, never a stack trace through the mock's own
 * bundle. A port another process holds is said in those words; any other
 * failure gives its message, and its stack goes to the worker's log, which
 * reaches Studio's terminal too.
 *
 * @param error - What the start rejected with
 * @returns The reason to report
 * @example
 * ```ts
 * start().catch((error: unknown) => sendError(startFailure(error), true));
 * ```
 */
export function startFailure(error: unknown): string {
  const port = portInUse(error);
  if (port !== undefined) return `Port ${port} is in use by another process.`;
  logger.error("MockWorker", "The mock did not start", error);
  return error instanceof Error ? error.message : String(error);
}

/** The port an EADDRINUSE error names, when it is one */
function portInUse(error: unknown): number | undefined {
  if (!(error instanceof Error) || !("code" in error) || error.code !== "EADDRINUSE") {
    return undefined;
  }
  return "port" in error && typeof error.port === "number" ? error.port : undefined;
}
