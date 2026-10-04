import { createLogger } from "@noverax/courier";

const log = createLogger("Studio");

/* How long closing may take before the process ends anyway. */
const STOP_BUDGET_MS = 10_000;

/** The part of `process` this needs, so a test can stand in for it. */
export interface FatalProcess {
  on(
    event: "uncaughtException" | "unhandledRejection",
    listener: (error: unknown) => void,
  ): unknown;
  exit(code: number): void;
}

/**
 * Close Studio before the process ends on an error nothing caught.
 *
 * Node ends the process on an uncaught exception or an unhandled rejection
 * at once, leaving the mock servers Studio started without their parent and
 * its sessions unwritten. Studio closes first — its mocks stopped, its
 * storage closed, for up to ten seconds — logs what happened, and exits
 * with status 1.
 *
 * @param close - Closes Studio
 * @param proc - The process to watch; `process` unless a test stands in for it
 * @example
 * ```ts
 * const server = createStudioServer({ port, host, projectRoot });
 * closeOnFatal(() => server.close());
 * ```
 */
export function closeOnFatal(close: () => Promise<void>, proc: FatalProcess = process): void {
  let stopping = false;
  const fatal = (what: string) => (error: unknown) => {
    log.error(`${what}; closing Studio`, error);
    if (stopping) return;
    stopping = true;
    const deadline = setTimeout(() => proc.exit(1), STOP_BUDGET_MS);
    deadline.unref();
    close()
      .catch((failure: unknown) => log.error("Studio did not close cleanly", failure))
      .finally(() => proc.exit(1));
  };
  proc.on("uncaughtException", fatal("An error nothing caught"));
  proc.on("unhandledRejection", fatal("A rejection nothing handled"));
}
