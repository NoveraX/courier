import type { ChildProcess, ForkOptions, fork } from "node:child_process";

/** A process the code under test forked, and every message it was sent. */
export interface Forked {
  readonly child: ChildProcess;
  readonly sent: unknown[];
  /** Whether the process has ended and its output is closed: a job's place is given back then. */
  closed: boolean;
}

/**
 * Node's own `fork`, recording each process it starts, the messages the
 * process is sent and its end, so a test sees which of Courier's worker
 * processes ran, what each was given, and whether it has ended. A
 * process's `send` is its own, set when Node opens its channel, not its
 * prototype's: it is wrapped on each process.
 *
 * @param real - Node's `fork`
 * @param forked - Where each process is recorded
 * @returns A `fork` that records
 * @example
 * ```ts
 * const forks = vi.hoisted((): Forked[] => []);
 * vi.mock("node:child_process", async (importOriginal) => {
 *   const real = await importOriginal<typeof ChildProcesses>();
 *   const { recordingFork } = await import("./helpers/forked-processes");
 *   return { ...real, fork: recordingFork(real.fork, forks) };
 * });
 * ```
 */
export function recordingFork(
  real: typeof fork,
  forked: Forked[],
): (script: string | URL, args?: readonly string[], options?: ForkOptions) => ChildProcess {
  return (script, args, options) => {
    const child = real(script, args, options);
    const record: Forked = { child, sent: [], closed: false };
    child.send = new Proxy(child.send, {
      apply(send, self: unknown, message: unknown[]) {
        record.sent.push(message[0]);
        return Reflect.apply(send, self, message);
      },
    });
    child.once("close", () => {
      record.closed = true;
    });
    forked.push(record);
    return child;
  };
}
