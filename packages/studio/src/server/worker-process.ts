import { type ChildProcess, fork } from "node:child_process";
import type { Readable } from "node:stream";
import { pathToFileURL } from "node:url";

import { JOB_MEMORY_CAP } from "./job-memory-cap";
import { JOB_MEMORY_WATCH_SCRIPT } from "./worker-scripts";

/* A line of stderr is read up to this long: an error's own line is far shorter. */
const LINE_KEPT = 4 * 1024;
/* What V8 reports, on every platform, as a process runs out of its heap. */
const OUT_OF_MEMORY = /JavaScript heap out of memory/;
/* The line an uncaught error starts its report with, or V8's fatal one. */
const ERROR_LINE = /^(?:FATAL ERROR: .+|\w*(?:Error|Exception)(?: \[\w+\])?: .+)$/;

/** Which memory a process ran out of: its JavaScript heap, or what the whole process may take. */
export type OutOfMemory = "heap" | "process";

/** How Studio starts a worker process, besides its script and Node flags. */
export interface WorkerProcessOptions {
  /**
   * The most memory the whole process may take, in megabytes: past it, a
   * thread of its own stops the process, as it does once Studio is gone.
   * None when omitted.
   */
  memoryMb?: number | undefined;
}

/** A process Studio started to do its long work in, out of its server's own. */
export interface WorkerProcess {
  /** The process. */
  readonly child: ChildProcess;
  /** Which memory the process ran out of, as its stderr reported, if it did. */
  outOfMemory(): OutOfMemory | undefined;
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
 * Windows. Given a memory cap, the process loads a watch ahead of its
 * script, which stops it once it takes more, however busy, outside its
 * heap too — a native module's memory, a buffer's — where V8 bounds none.
 *
 * @param script - The worker script, from Studio's lib
 * @param flags - The Node flags it runs with: the heap its job may take
 * @param options - The most memory the whole process may take
 * @returns The process, and what its stderr said
 * @example
 * ```ts
 * const worker = startWorkerProcess(SPEC_WORKER_SCRIPT, jobFlags(VISITOR_READ));
 * worker.child.on("close", () => worker.outOfMemory() && …);
 * ```
 */
export function startWorkerProcess(
  script: string,
  flags: readonly string[],
  { memoryMb }: WorkerProcessOptions = {},
): WorkerProcess {
  const capped = memoryMb !== undefined;
  const child = fork(script, [], {
    execArgv: capped
      ? [...flags, `--import=${pathToFileURL(JOB_MEMORY_WATCH_SCRIPT).href}`]
      : [...flags],
    env: capped ? { ...process.env, [JOB_MEMORY_CAP.env]: String(memoryMb) } : process.env,
    serialization: "advanced",
    stdio: ["ignore", "ignore", "pipe", "ipc"],
    windowsHide: true,
  });
  let outOfMemory: OutOfMemory | undefined;
  let error: string | undefined;
  readLines(child.stderr, (line) => {
    if (OUT_OF_MEMORY.test(line)) outOfMemory ??= "heap";
    else if (line.startsWith(JOB_MEMORY_CAP.passed)) outOfMemory ??= "process";
    if (ERROR_LINE.test(line)) error = line;
  });
  return { child, outOfMemory: () => outOfMemory, lastError: () => error };
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
