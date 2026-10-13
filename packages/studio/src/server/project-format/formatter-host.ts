import { availableParallelism } from "node:os";
import { Worker } from "node:worker_threads";
import { createLogger } from "@noverax/courier";
import { STUDIO_THREAD_SCRIPT } from "../studio-thread-script";
import { type FormatRequest, isFormatReply } from "./worker-protocol";

const log = createLogger("Studio");

/* A tool loaded with a typed-lint configuration takes seconds; one stuck takes forever. */
const TIMEOUT_MS = 60_000;
/* Kept warm between changes a user makes in a row; let go once they stop. */
const IDLE_MS = 5 * 60_000;
/* Formatting is all computation: a thread for each core Studio's own does not need, up to three. */
const THREADS = Math.max(1, Math.min(3, availableParallelism() - 1));

interface Waiting {
  resolve: (text: string) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
}

interface Thread {
  worker: Worker;
  waiting: Map<number, Waiting>;
}

interface Host {
  stamp: string;
  threads: Thread[];
  nextId: number;
  idle: NodeJS.Timeout | undefined;
}

const hosts = new Map<string, Host>();

/**
 * Run ESLint or Prettier on one file in the threads kept for the project:
 * started as files come, up to three, each loading a tool once and keeping
 * it, and all started again once the configurations they read change. They
 * go after five idle minutes, and a thread whose tool takes over a minute
 * on one file goes at once.
 *
 * @param root - The project root
 * @param stamp - The configurations the tools read, as they are now
 * @param request - The tool, its module, the file's path and its text
 * @returns The text as the tool leaves it
 * @throws {Error} When the tool fails on the file, or its thread does
 * @example
 * ```ts
 * await formatInThread(root, formatters.stamp, { tool: "Prettier", module, root, path, text });
 * ```
 */
export function formatInThread(
  root: string,
  stamp: string,
  request: Omit<FormatRequest, "id">,
): Promise<string> {
  const host = hostFor(root, stamp);
  const thread = leastBusy(root, host);
  const id = host.nextId++;
  clearTimeout(host.idle);
  thread.worker.ref();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      const reason = new Error(`it took longer than ${TIMEOUT_MS / 1000} s`);
      void end(root, host, thread, reason);
    }, TIMEOUT_MS);
    thread.waiting.set(id, { resolve, reject, timer });
    thread.worker.postMessage({ ...request, id } satisfies FormatRequest);
  });
}

/**
 * Let a project's formatter threads go, as its Studio stops.
 *
 * @param root - The project root
 * @returns Once every thread has ended
 */
export async function closeFormatterThread(root: string): Promise<void> {
  const host = hosts.get(root);
  if (host === undefined) return;
  hosts.delete(root);
  await stopAll(root, host, new Error("Studio stopped"));
}

function hostFor(root: string, stamp: string): Host {
  const known = hosts.get(root);
  if (known?.stamp === stamp) return known;
  if (known) void stopAll(root, known, new Error("the configuration changed"));
  const host: Host = { stamp, threads: [], nextId: 1, idle: undefined };
  hosts.set(root, host);
  return host;
}

/* A thread with nothing to do, a new one while there may be more, or the one with least to do. */
function leastBusy(root: string, host: Host): Thread {
  const free = host.threads.find((thread) => thread.waiting.size === 0);
  if (free !== undefined) return free;
  if (host.threads.length < THREADS) return started(root, host);
  return host.threads.reduce((a, b) => (b.waiting.size < a.waiting.size ? b : a));
}

function started(root: string, host: Host): Thread {
  const thread: Thread = { worker: new Worker(STUDIO_THREAD_SCRIPT), waiting: new Map() };
  thread.worker.on("message", (message: unknown) => answer(root, host, thread, message));
  thread.worker.on("error", (error: unknown) => {
    void end(root, host, thread, error instanceof Error ? error : new Error(String(error)));
  });
  thread.worker.on("exit", () => void end(root, host, thread, new Error("its thread ended")));
  thread.worker.unref();
  host.threads.push(thread);
  return thread;
}

function answer(root: string, host: Host, thread: Thread, message: unknown): void {
  if (!isFormatReply(message)) return;
  const waiting = thread.waiting.get(message.id);
  if (waiting === undefined) return;
  thread.waiting.delete(message.id);
  clearTimeout(waiting.timer);
  if ("text" in message) waiting.resolve(message.text);
  else waiting.reject(new Error(message.error));
  if (thread.waiting.size > 0) return;
  thread.worker.unref();
  if (host.threads.some((other) => other.waiting.size > 0)) return;
  host.idle = setTimeout(() => {
    if (hosts.get(root) === host) hosts.delete(root);
    void stopAll(root, host, new Error("idle"));
  }, IDLE_MS);
  host.idle.unref();
}

/* End one thread, failing what still waits on it. */
async function end(root: string, host: Host, thread: Thread, reason: Error): Promise<void> {
  host.threads = host.threads.filter((other) => other !== thread);
  for (const waiting of thread.waiting.values()) {
    clearTimeout(waiting.timer);
    waiting.reject(reason);
  }
  thread.waiting.clear();
  log.debug(`a formatter thread for ${root} ends: ${reason.message}`);
  await thread.worker.terminate();
}

async function stopAll(root: string, host: Host, reason: Error): Promise<void> {
  clearTimeout(host.idle);
  await Promise.all([...host.threads].map((thread) => end(root, host, thread, reason)));
}
