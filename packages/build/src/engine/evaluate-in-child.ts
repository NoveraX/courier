import { type ChildProcess, fork } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { RoutesReadError } from "./routes-read-error";
import type { RoutesRequest, RoutesSnapshot } from "./routes-snapshot";
import type { WorkerReply } from "./worker-reply";

/** How long a reading may take before it is given up: a config that waits on the network never ends. */
const READ_LIMIT_MS = 60_000;

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
  limitMs: number = READ_LIMIT_MS,
): Promise<RoutesSnapshot> {
  return new Promise((resolve, reject) => {
    const child = fork(workerFile(), [], {
      execArgv: [],
      stdio: ["ignore", "inherit", "inherit", "ipc"],
    });
    const settle = settleOnce(child, resolve, reject);
    const unread = (message: string): RoutesReadError =>
      new RoutesReadError("ROUTES_NOT_READ", message, {
        root: request.root,
        configFile: request.configFile,
      });
    const timer = setTimeout(() => {
      settle(unread(`The config was still being read after ${limitMs / 1000} s, and was given up`));
    }, limitMs);
    child.once("message", (reply: WorkerReply) => settle(outcomeOf(reply)));
    child.once("error", (error) =>
      settle(unread(`The process that reads the config did not start: ${error.message}`)),
    );
    /* After the channel and the output have closed, so an answer sent just before is in. */
    child.once("close", (code, signal) =>
      settle(
        unread(`The process that reads the config ended (${signal ?? code}) before it answered`),
      ),
    );
    child.once("spawn", () => child.send(request));
    settle.onSettled(() => clearTimeout(timer));
  });
}

/* The routes an answer carries, or the error it reports. */
function outcomeOf(reply: WorkerReply): RoutesSnapshot | RoutesReadError {
  if (reply.ok) return reply.snapshot;
  return new RoutesReadError(reply.code, reply.message, reply.context, reply.stack);
}

type Settle = ((outcome: RoutesSnapshot | RoutesReadError) => void) & {
  onSettled(then: () => void): void;
};

/* The first outcome settles the reading; the process is stopped if it is still running. */
function settleOnce(
  child: ChildProcess,
  resolve: (snapshot: RoutesSnapshot) => void,
  reject: (error: RoutesReadError) => void,
): Settle {
  let settled = false;
  const after: Array<() => void> = [];
  const settle = (outcome: RoutesSnapshot | RoutesReadError): void => {
    if (settled) return;
    settled = true;
    for (const then of after) then();
    if (child.exitCode === null && child.signalCode === null) child.kill();
    if (outcome instanceof RoutesReadError) reject(outcome);
    else resolve(outcome);
  };
  return Object.assign(settle, { onSettled: (then: () => void) => after.push(then) });
}

let found: string | undefined;

/* The worker this package ships: under the package's own root, which holds the manifest
   with its name, wherever this module was bundled into. */
function workerFile(): string {
  if (found !== undefined) return found;
  let dir = dirname(fileURLToPath(import.meta.url));
  while (!isPackageRoot(dir)) {
    const parent = dirname(dir);
    if (parent === dir) throw new Error(`${PACKAGE_NAME} cannot find its own folder`);
    dir = parent;
  }
  found = join(dir, "lib/engine/worker.js");
  return found;
}

function isPackageRoot(dir: string): boolean {
  const manifest = join(dir, "package.json");
  if (!existsSync(manifest)) return false;
  const parsed: unknown = JSON.parse(readFileSync(manifest, "utf8"));
  return (
    typeof parsed === "object" && parsed !== null && Reflect.get(parsed, "name") === PACKAGE_NAME
  );
}
