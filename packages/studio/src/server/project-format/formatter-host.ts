import { availableParallelism } from "node:os";
import { createLogger } from "@noverax/courier";
import { startWorkerProcess, stopWorkerProcess, type WorkerProcess } from "../worker-process";
import { FORMAT_WORKER_SCRIPT } from "../worker-scripts";
import { type FormatRequest, isFormatReply } from "./worker-protocol";

const log = createLogger("Studio");

/* A tool loaded with a typed-lint configuration takes seconds; one stuck takes forever. */
const TIMEOUT_MS = 60_000;
/* Kept warm between changes a user makes in a row; let go once they stop. */
const IDLE_MS = 5 * 60_000;
/* Formatting is all computation: a process for each core Studio's own does not need, up to three. */
const FORMATTERS = Math.max(1, Math.min(3, availableParallelism() - 1));

interface Waiting {
  resolve: (text: string) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
}

interface Formatter {
  worker: WorkerProcess;
  waiting: Map<number, Waiting>;
}

interface Host {
  stamp: string;
  formatters: Formatter[];
  nextId: number;
  idle: NodeJS.Timeout | undefined;
}

const hosts = new Map<string, Host>();

/**
 * Run ESLint or Prettier on one file in the processes kept for the project:
 * started as files come, up to three, each loading a tool once and keeping
 * it, and all started again once the configurations they read change. They
 * go after five idle minutes, and a process whose tool takes over a minute
 * on one file is stopped at once. A process that fails fails only the
 * files it was given: Studio goes on, and starts another for the next.
 *
 * @param root - The project root
 * @param stamp - The configurations the tools read, as they are now
 * @param request - The tool, its module, the file's path and its text
 * @returns The text as the tool leaves it
 * @throws {Error} When the tool fails on the file, or its process does
 * @example
 * ```ts
 * await formatInProcess(root, formatters.stamp, { tool: "Prettier", module, root, path, text });
 * ```
 */
export function formatInProcess(
  root: string,
  stamp: string,
  request: Omit<FormatRequest, "id">,
): Promise<string> {
  const host = hostFor(root, stamp);
  const formatter = leastBusy(root, host);
  const id = host.nextId++;
  clearTimeout(host.idle);
  holdOpen(formatter, true);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      const reason = new Error(`it took longer than ${TIMEOUT_MS / 1000} s`);
      void end(root, host, formatter, reason);
    }, TIMEOUT_MS);
    formatter.waiting.set(id, { resolve, reject, timer });
    formatter.worker.child.send({ ...request, id } satisfies FormatRequest, (error) => {
      if (error) void end(root, host, formatter, error);
    });
  });
}

/**
 * Let a project's formatter processes go, as its Studio stops.
 *
 * @param root - The project root
 * @returns Once every process has ended
 * @example
 * ```ts
 * await closeFormatProcesses(studio.root);
 * ```
 */
export async function closeFormatProcesses(root: string): Promise<void> {
  const host = hosts.get(root);
  if (host === undefined) return;
  hosts.delete(root);
  await stopAll(root, host, new Error("Studio stopped"));
}

function hostFor(root: string, stamp: string): Host {
  const known = hosts.get(root);
  if (known?.stamp === stamp) return known;
  if (known) void stopAll(root, known, new Error("the configuration changed"));
  const host: Host = { stamp, formatters: [], nextId: 1, idle: undefined };
  hosts.set(root, host);
  return host;
}

/* A process with nothing to do, a new one while there may be more, or the one with least to do. */
function leastBusy(root: string, host: Host): Formatter {
  const free = host.formatters.find((formatter) => formatter.waiting.size === 0);
  if (free !== undefined) return free;
  if (host.formatters.length < FORMATTERS) return started(root, host);
  return host.formatters.reduce((a, b) => (b.waiting.size < a.waiting.size ? b : a));
}

function started(root: string, host: Host): Formatter {
  const formatter: Formatter = {
    worker: startWorkerProcess(FORMAT_WORKER_SCRIPT, []),
    waiting: new Map(),
  };
  const { child } = formatter.worker;
  child.on("message", (message: unknown) => answer(root, host, formatter, message));
  child.on("error", (error: Error) => void end(root, host, formatter, error));
  child.on("close", (code: number | null, signal: NodeJS.Signals | null) => {
    void end(root, host, formatter, ended(formatter.worker, code, signal));
  });
  holdOpen(formatter, false);
  host.formatters.push(formatter);
  return formatter;
}

/* Whether a process keeps Studio from exiting: only while it has a file to format. */
function holdOpen({ worker: { child } }: Formatter, held: boolean): void {
  if (held) {
    child.ref();
    child.channel?.ref();
  } else {
    child.unref();
    child.channel?.unref();
  }
}

function answer(root: string, host: Host, formatter: Formatter, message: unknown): void {
  if (!isFormatReply(message)) return;
  const waiting = formatter.waiting.get(message.id);
  if (waiting === undefined) return;
  formatter.waiting.delete(message.id);
  clearTimeout(waiting.timer);
  if ("text" in message) waiting.resolve(message.text);
  else waiting.reject(new Error(message.error));
  if (formatter.waiting.size > 0) return;
  holdOpen(formatter, false);
  if (host.formatters.some((other) => other.waiting.size > 0)) return;
  host.idle = setTimeout(() => {
    if (hosts.get(root) === host) hosts.delete(root);
    void stopAll(root, host, new Error("idle"));
  }, IDLE_MS);
  host.idle.unref();
}

/* How a process ended on its own: out of memory, or with the error it reported, if it did. */
function ended(worker: WorkerProcess, code: number | null, signal: NodeJS.Signals | null): Error {
  if (worker.outOfMemory() !== undefined) return new Error("its process ran out of memory");
  const how = signal === null ? `code ${code}` : `signal ${signal}`;
  const reported = worker.lastError();
  return new Error(`its process ended with ${how}${reported ? `: ${reported}` : ""}`);
}

/* End one process, failing what still waits on it. */
async function end(root: string, host: Host, formatter: Formatter, reason: Error): Promise<void> {
  host.formatters = host.formatters.filter((other) => other !== formatter);
  for (const waiting of formatter.waiting.values()) {
    clearTimeout(waiting.timer);
    waiting.reject(reason);
  }
  formatter.waiting.clear();
  const { child } = formatter.worker;
  if (child.exitCode !== null || child.signalCode !== null) return;
  log.debug(`a formatter process for ${root} ends: ${reason.message}`);
  const closed = new Promise<void>((resolve) => child.once("close", () => resolve()));
  stopWorkerProcess(child);
  await closed;
}

async function stopAll(root: string, host: Host, reason: Error): Promise<void> {
  clearTimeout(host.idle);
  await Promise.all([...host.formatters].map((formatter) => end(root, host, formatter, reason)));
}
