import { createLogger } from "@noverax/courier";

const log = createLogger("Studio");

/** Exit statuses a shell reports for a process a signal ended: 128 + the signal's number. */
const SIGNAL_EXIT = { SIGHUP: 129, SIGINT: 130, SIGTERM: 143, SIGBREAK: 149 } as const;

/* Ctrl+Break, which only Windows has. */
const WINDOWS_ONLY: ReadonlySet<StudioSignal> = new Set(["SIGBREAK"]);

/* A signal this long after the first is someone asking again, not the first one passed on. */
const INSIST_MS = 1_000;

/** The signals Studio closes on. */
export type StudioSignal = keyof typeof SIGNAL_EXIT;

/** The part of `process` this needs, so a test can stand in for it. */
export interface SignalProcess {
  readonly platform: string;
  on(signal: StudioSignal, listener: () => void): unknown;
  exit(code: number): void;
}

/**
 * Close Studio when it is asked to stop — Ctrl+C, a `kill`, its terminal
 * closing, and Ctrl+Break on Windows — and exit with the status a shell
 * reports for the signal.
 *
 * Studio closes its mock servers, its sockets and its stores, and takes
 * away the file that tells editors where it runs. A terminal's Ctrl+C
 * reaches it twice when npm or npx started it, which pass the signal on:
 * the second must not end Studio halfway through closing, leaving that
 * file and its mocks behind. A signal a second or more after the first is
 * someone asking again, and ends Studio at once.
 *
 * @param close - Closes Studio
 * @param proc - The process to watch; `process` unless a test stands in for it
 * @param now - The time now, in milliseconds
 * @example
 * ```ts
 * const server = createStudioServer({ port, host, projectRoot });
 * closeOnSignals(() => server.close());
 * ```
 */
export function closeOnSignals(
  close: () => Promise<void>,
  proc: SignalProcess = process,
  now: () => number = Date.now,
): void {
  let closingSince: number | undefined;
  for (const [signal, status] of Object.entries(SIGNAL_EXIT) as [StudioSignal, number][]) {
    if (WINDOWS_ONLY.has(signal) && proc.platform !== "win32") continue;
    proc.on(signal, () => {
      if (closingSince !== undefined) {
        if (now() - closingSince >= INSIST_MS) proc.exit(status);
        return;
      }
      closingSince = now();
      close()
        .catch((err: unknown) => log.error("Studio did not close cleanly", err))
        .finally(() => proc.exit(status));
    });
  }
}
