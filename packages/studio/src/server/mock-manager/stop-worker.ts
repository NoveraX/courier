import type { ChildProcess } from "node:child_process";

const GRACEFUL_TIMEOUT = 3000;
const FORCE_TIMEOUT = 2000;

/**
 * Ask a worker to stop and wait until it has exited.
 *
 * A worker that has not exited three seconds after the request is sent
 * SIGTERM, and SIGKILL two seconds after that. Resolves at once for a worker
 * that has already exited, and leaves no timer behind.
 *
 * @param child - The worker
 * @param askToStop - Sends the worker its stop message
 * @returns Resolves once the worker has exited
 * @example
 * ```ts
 * await stopWorker(child, () => child.send({ type: "stop" }));
 * ```
 */
export function stopWorker(child: ChildProcess, askToStop: () => void): Promise<void> {
  return new Promise<void>((resolve) => {
    if (child.exitCode !== null || child.signalCode !== null) return resolve();
    const timers: NodeJS.Timeout[] = [];
    child.once("exit", () => {
      for (const timer of timers) clearTimeout(timer);
      resolve();
    });
    askToStop();
    timers.push(
      setTimeout(() => {
        child.kill("SIGTERM");
        timers.push(setTimeout(() => child.kill("SIGKILL"), FORCE_TIMEOUT));
      }, GRACEFUL_TIMEOUT),
    );
  });
}
