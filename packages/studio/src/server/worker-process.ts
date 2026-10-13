import { type ChildProcess, fork } from "node:child_process";
import type { Readable } from "node:stream";

/* A line of stderr is read up to this long: an error's own line is far shorter. */
const LINE_KEPT = 4 * 1024;
/* What V8 reports, on every platform, as a process runs out of its heap. */
const OUT_OF_MEMORY = /JavaScript heap out of memory/;
/* The line an uncaught error starts its report with, or V8's fatal one. */
const ERROR_LINE = /^(?:FATAL ERROR: .+|\w*(?:Error|Exception)(?: \[\w+\])?: .+)$/;

/** A process Studio started to do its long work in, out of its server's own. */
export interface WorkerProcess {
  /** The process. */
  readonly child: ChildProcess;
  /** Whether V8 reported, on its stderr, that the process ran out of its heap. */
  ranOutOfMemory(): boolean;
  /** The last error the process reported on its stderr — uncaught, or V8's fatal one — if any. */
  lastError(): string | undefined;
}

/**
 * Start one of Studio's worker scripts in a process of its own. Stopping a
 * process, however busy, is safe, and one that fails, however it fails,
 * leaves Studio running — neither holds for a thread, which Node on Windows
 * can take the whole process down with when it is stopped in the middle of
 * its work.
 *
 * The process gets the Node flags given and none of Studio's own — Studio
 * started under a debugger would hand it a port already taken — its
 * messages are copied as structured clones, as between threads, and of its
 * output only its stderr is read, for why it failed: whether it ran out of
 * memory, and the last error it reported. V8 follows its report with a
 * native backtrace of up to hundreds of lines, so each line is read as it
 * comes rather than the end of what was written. It opens no window on
 * Windows.
 *
 * @param script - The worker script, from Studio's lib
 * @param flags - The Node flags it runs with: the memory its job may take
 * @returns The process, and what its stderr said
 * @example
 * ```ts
 * const worker = startWorkerProcess(SPEC_WORKER_SCRIPT, jobFlags(VISITOR_READ));
 * worker.child.on("close", () => worker.ranOutOfMemory() && …);
 * ```
 */
export function startWorkerProcess(script: string, flags: readonly string[]): WorkerProcess {
  const child = fork(script, [], {
    execArgv: [...flags],
    serialization: "advanced",
    stdio: ["ignore", "ignore", "pipe", "ipc"],
    windowsHide: true,
  });
  let outOfMemory = false;
  let error: string | undefined;
  readLines(child.stderr, (line) => {
    if (OUT_OF_MEMORY.test(line)) outOfMemory = true;
    if (ERROR_LINE.test(line)) error = line;
  });
  return { child, ranOutOfMemory: () => outOfMemory, lastError: () => error };
}

/* Each line a stream writes, as it comes, cut at LINE_KEPT; the last one at its end. */
function readLines(stream: Readable | null, read: (line: string) => void): void {
  let partial = "";
  stream?.setEncoding("utf8");
  stream?.on("data", (chunk: string) => {
    const lines = (partial + chunk).split(/\r?\n/);
    partial = (lines.pop() ?? "").slice(0, LINE_KEPT);
    for (const line of lines) read(line.slice(0, LINE_KEPT));
  });
  stream?.on("end", () => {
    if (partial !== "") read(partial);
  });
}

/**
 * Stop a worker process at once, whatever it is doing, if it is still
 * running: a job stopped leaves nothing behind.
 *
 * @param child - The process
 * @example
 * ```ts
 * stopWorkerProcess(worker.child);
 * ```
 */
export function stopWorkerProcess(child: ChildProcess): void {
  if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
}
