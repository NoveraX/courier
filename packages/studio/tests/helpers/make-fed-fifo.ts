import { type ChildProcess, execFileSync, spawn } from "node:child_process";

const writers: ChildProcess[] = [];

/* Opening a FIFO to write waits for a reader, so the write runs in a process of its own; no shell is asked. */
const WRITE_FIFO = "require('node:fs').writeFileSync(process.argv[1], process.argv[2])";

/**
 * Make a FIFO at `path` and start another process that writes `content` into
 * it once something opens it for reading.
 *
 * A reader that opens the FIFO without `O_NONBLOCK` then gets `content` and
 * an end of file instead of blocking this process's event loop for good, so
 * a test of code that must not block fails on code that does, rather than
 * hanging the run.
 *
 * @param path - Where to make the FIFO
 * @param content - What the writer sends
 */
export function makeFedFifo(path: string, content: string): void {
  execFileSync("mkfifo", [path]);
  const writer = spawn(process.execPath, ["-e", WRITE_FIFO, path, content], { stdio: "ignore" });
  writers.push(writer);
}

/** Stop every writer still waiting for a reader. */
export function stopFifoWriters(): void {
  for (const writer of writers.splice(0)) writer.kill("SIGKILL");
}
