import { createLogger } from "@noverax/courier";

const log = createLogger("Server");

/* How long a stop may take before the process ends anyway. */
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
 * Stop the server before the process ends on an error nothing caught.
 *
 * Node ends the process on an uncaught exception or an unhandled rejection
 * at once, cutting every request and stream in flight. The command stops
 * the server first — its streams told, its connections drained, for up to
 * ten seconds — logs what happened, and exits with status 1. The library
 * installs nothing of the kind: whether a host process ends is its own call.
 *
 * @param stop - Stops the server
 * @param proc - The process to watch; `process` unless a test stands in for it
 * @example
 * ```ts
 * const server = createCourierServer({ sources });
 * stopOnFatal(() => server.stop());
 * ```
 */
export function stopOnFatal(stop: () => Promise<void>, proc: FatalProcess = process): void {
  let stopping = false;
  const fatal = (what: string) => (error: unknown) => {
    log.error(`${what}; stopping the server`, error);
    if (stopping) return;
    stopping = true;
    const deadline = setTimeout(() => proc.exit(1), STOP_BUDGET_MS);
    deadline.unref();
    stop()
      .catch((failure: unknown) => log.error("The server did not stop cleanly", failure))
      .finally(() => proc.exit(1));
  };
  proc.on("uncaughtException", fatal("An error nothing caught"));
  proc.on("unhandledRejection", fatal("A rejection nothing handled"));
}
