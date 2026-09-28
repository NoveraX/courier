import { errnoCode } from "../errno-code";

/**
 * Tell whether another process with this id is running: a Studio that is
 * still making the write a journal or a temporary file belongs to. Signal
 * 0 only asks whether the process exists; one that belongs to another user
 * exists too.
 *
 * An id a crashed Studio had may since have gone to an unrelated process;
 * its write is then left for a later start, which is the safe mistake.
 *
 * @param pid - The process id a journal or a temporary file's name records
 * @returns `true` when a process other than this one runs under that id
 * @throws The system's error for anything but a missing process or one Studio may not signal
 * @example
 * ```ts
 * if (runsElsewhere(journal.pid)) return; // its Studio finishes or undoes it
 * ```
 */
export function runsElsewhere(pid: number): boolean {
  if (pid === process.pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    const code = errnoCode(error);
    if (code === "ESRCH") return false;
    if (code === "EPERM") return true;
    throw error;
  }
}
