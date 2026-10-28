import type { ChildProcess } from "node:child_process";

/** How long a process is given to end once let go, before it is killed. */
const GRACE_MS = 2_000;

/* Every reading's process still running, killed should this process exit first. */
const running = new Set<ChildProcess>();

let exitWatched = false;

/**
 * Watch over a reading's process for as long as it runs. Let go, it no
 * longer holds this process open: the channel to it closes, which ends it,
 * one that never answered is asked to end, and one still running after a
 * grace period is killed — a config may ignore SIGTERM, or block the
 * process's loop. One still running when this process exits is killed then.
 *
 * @param child - The process, just started
 * @returns How to let it go, saying whether it answered
 * @example
 * ```ts
 * const release = superviseChild(fork(worker));
 * release(false); // gave up waiting for it
 * ```
 */
export function superviseChild(child: ChildProcess): (answered: boolean) => void {
  watchExit();
  running.add(child);
  child.once("exit", () => running.delete(child));
  return (answered) => {
    if (!isRunning(child)) return;
    if (child.connected) child.disconnect();
    child.unref();
    if (!answered) child.kill("SIGTERM");
    setTimeout(() => {
      if (isRunning(child)) child.kill("SIGKILL");
    }, GRACE_MS).unref();
  };
}

function watchExit(): void {
  if (exitWatched) return;
  exitWatched = true;
  process.on("exit", () => {
    for (const child of running) child.kill("SIGKILL");
  });
}

function isRunning(child: ChildProcess): boolean {
  return child.exitCode === null && child.signalCode === null;
}
