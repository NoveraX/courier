import { type ChildProcess, fork } from "node:child_process";

import { CONFIG_READ_LIMIT_MS } from "../config/read-limits";
import { packageFile } from "../util/package-file";
import { RoutesReadError } from "./routes-read-error";
import type { RoutesRequest, RoutesSnapshot } from "./routes-snapshot";
import { superviseChild } from "./supervise-child";
import { workerMessages } from "./worker-messages";
import type { WorkerReply } from "./worker-reply";

/** The package this module ships in, by the name its manifest gives. */
const PACKAGE_NAME = "@noverax/courier-build";

/**
 * Read a project's routes in a process of its own, started for this reading
 * alone: the config runs there, never in the bundler's process, so a module
 * it reaches is read as it is now, and nothing it leaves behind lingers.
 *
 * @param request - Where the project is, and which env files it reads
 * @param limitMs - How long the reading may take
 * @returns The routes, and what they depended on
 * @throws RoutesReadError for a config that would not load, and
 *   `ROUTES_NOT_READ` when the process ran out of time or ended unanswered
 * @example
 * ```ts
 * const snapshot = await evaluateInChild({ root: "/app", envFiles: [] });
 * ```
 */
export function evaluateInChild(
  request: RoutesRequest,
  limitMs: number = CONFIG_READ_LIMIT_MS,
): Promise<RoutesSnapshot> {
  return new Promise((resolve, reject) => {
    const unread = (message: string): RoutesReadError =>
      new RoutesReadError("ROUTES_NOT_READ", message, {
        root: request.root,
        configFile: request.configFile,
      });
    const worker = packageFile("lib/engine/worker.js");
    if (worker === undefined) {
      reject(unread(`${PACKAGE_NAME} cannot find the folder it is installed in: install it again`));
      return;
    }
    const child = fork(worker, [], {
      execArgv: [],
      stdio: ["ignore", "inherit", "inherit", "ipc"],
    });
    const settle = settleOnce(superviseChild(child), resolve, reject);
    const timer = setTimeout(() => {
      settle(unread(`The config was still being read after ${limitMs / 1000} s, and was given up`));
    }, limitMs);
    settle.onSettled(() => clearTimeout(timer));
    ask(child, request, settle, unread);
  });
}

/* Send the request once the process runs, and settle on its answer, or on why it gave none. */
function ask(
  child: ChildProcess,
  request: RoutesRequest,
  settle: Settle,
  unread: (message: string) => RoutesReadError,
): void {
  child.on("message", (message: unknown) => {
    if (workerMessages.isReply(message)) settle(outcomeOf(message.reply), true);
  });
  child.once("error", (error) =>
    settle(unread(`The process that reads the config did not start: ${error.message}`)),
  );
  /* After the channel and the output have closed, so an answer sent just before is in. */
  child.once("close", (code, signal) =>
    settle(
      unread(`The process that reads the config ended (${signal ?? code}) before it answered`),
    ),
  );
  child.once("spawn", () => child.send(workerMessages.request(request)));
}

/* The routes an answer carries, or the error it reports. */
function outcomeOf(reply: WorkerReply): RoutesSnapshot | RoutesReadError {
  if (reply.ok) return reply.snapshot;
  return new RoutesReadError(reply.code, reply.message, reply.context, {
    stack: reply.stack,
    inputs: reply.inputs,
  });
}

type Settle = ((outcome: RoutesSnapshot | RoutesReadError, answered?: boolean) => void) & {
  onSettled(then: () => void): void;
};

/* The first outcome settles the reading, and lets its process go. */
function settleOnce(
  release: (answered: boolean) => void,
  resolve: (snapshot: RoutesSnapshot) => void,
  reject: (error: RoutesReadError) => void,
): Settle {
  let settled = false;
  const after: Array<() => void> = [];
  const settle = (outcome: RoutesSnapshot | RoutesReadError, answered = false): void => {
    if (settled) return;
    settled = true;
    for (const then of after) then();
    release(answered);
    if (outcome instanceof RoutesReadError) reject(outcome);
    else resolve(outcome);
  };
  return Object.assign(settle, { onSettled: (then: () => void) => after.push(then) });
}
