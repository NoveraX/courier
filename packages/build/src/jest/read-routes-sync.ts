import { join } from "node:path";
import { MessageChannel, receiveMessageOnPort, Worker } from "node:worker_threads";

import {
  isRoutesThreadReply,
  type RoutesThreadReply,
  type RoutesThreadRequest,
} from "./routes-thread-messages";

/** How long a reading may take: the engine's own limit, and time to start the thread. */
const WAIT_MS = 75_000;

/* The thread the engine runs in, for as long as this Jest worker does: it keeps what it read. */
let thread: Worker | undefined;

/**
 * Read the routes of a project as Jest asks a transformer for them: at once.
 * The engine runs on a thread of its own, which reads the config in a
 * process of its own as every bundler's plugin does; this one waits for its
 * answer. The thread keeps the routes it read, so a later call, made while
 * nothing they came from has changed, is answered without reading again.
 *
 * @param request - Where the project is
 * @returns The routes module, or why there is none
 * @example
 * ```ts
 * const reply = readRoutesSync({ root: options.config.rootDir });
 * ```
 */
export function readRoutesSync(request: RoutesThreadRequest): RoutesThreadReply {
  const signal = new Int32Array(new SharedArrayBuffer(4));
  const { port1, port2 } = new MessageChannel();
  routesThread().postMessage({ request, port: port2, signal }, [port2]);
  const waited = Atomics.wait(signal, 0, 0, WAIT_MS);
  const reply: unknown = receiveMessageOnPort(port1)?.message;
  port1.close();
  if (isRoutesThreadReply(reply)) return reply;
  const why = waited === "timed-out" ? `no answer in ${WAIT_MS / 1000} s` : "no answer";
  return { ok: false, message: `The routes were not read: the thread that reads them gave ${why}` };
}

/* Started once; it holds no Jest worker open, and a thread that ended is started again. */
function routesThread(): Worker {
  if (thread !== undefined) return thread;
  const started = new Worker(join(__dirname, "routes-thread.js"));
  started.unref();
  started.once("exit", () => {
    if (thread === started) thread = undefined;
  });
  thread = started;
  return started;
}
