import type { ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { freePort } from "../../support/free-port";
import { answers, settled } from "./answers";
import { startLogged, stopTree } from "./processes";
import type { QuickstartTarget } from "./targets";

/** An app the check started, with Studio beside it, and how to stop both. */
export interface RunningApp {
  readonly url: string;
  /** Stops both, and resolves once their processes have exited. */
  stop(): Promise<void>;
}

/**
 * Run a command to its end, its output kept in a log.
 *
 * @param command - The program and its arguments
 * @param cwd - Where it runs
 * @param env - Its environment
 * @param log - Where its output goes
 * @returns What it printed, and how it exited
 * @example
 * ```ts
 * const { status, output } = await runToEnd(["npx", "--yes", "@noverax/create-courier"], dir, env, log);
 * ```
 */
export function runToEnd(
  command: readonly string[],
  cwd: string,
  env: NodeJS.ProcessEnv,
  log: string,
): Promise<{ status: number; output: string }> {
  return new Promise((done) => {
    const child = startLogged(command, cwd, env, log);
    let output = "";
    child.stdout?.on("data", (chunk: Buffer) => {
      output += chunk;
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      output += chunk;
    });
    child.on("close", (status) => done({ status: status ?? 1, output }));
  });
}

/* What startApp started and nothing has stopped yet, with the folder it runs in. */
const started = new Set<{ readonly child: ChildProcess; readonly root: string }>();

function track(child: ChildProcess, root: string): ChildProcess {
  started.add({ child, root });
  return child;
}

/**
 * Stop everything `startApp` started and nothing has stopped yet — also
 * when a test ended before `startApp` returned, which leaves no app to
 * stop it by, and Studio would hold its port into the next check.
 *
 * @example
 * ```ts
 * test.afterAll(stopStarted);
 * ```
 */
export async function stopStarted(): Promise<void> {
  const all = [...started];
  started.clear();
  await Promise.all(all.map(({ child, root }) => stopTree(child, root)));
}

/**
 * Start a set-up app as its user would: Studio, which runs the mock, then
 * the app's dev server on a port of the check's, once the mock answers.
 *
 * @param root - The app's folder
 * @param target - What starts it, and where its page is
 * @param env - The environment both run with
 * @param logs - Where their output goes
 * @returns The app's address, and how to stop it and Studio
 * @throws {Error} When the mock or the app does not answer in time, naming the log to read
 * @example
 * ```ts
 * const app = await startApp(root, target, process.env, logs);
 * ```
 */
export async function startApp(
  root: string,
  target: QuickstartTarget,
  env: NodeJS.ProcessEnv,
  logs: string,
): Promise<RunningApp> {
  mkdirSync(logs, { recursive: true });
  if (target.port) {
    const file = join(root, target.port.file);
    writeFileSync(file, readFileSync(file, "utf8").replace(target.port.from, target.port.to));
  }
  track(startLogged(["npm", "run", "studio"], root, env, join(logs, "studio.log")), root);
  const mocks = join(root, "courier.mocks.ts");
  const mockPort = existsSync(mocks)
    ? /port:\s*(\d+)/.exec(readFileSync(mocks, "utf8"))?.[1]
    : undefined;
  if (mockPort && !(await answers(`http://127.0.0.1:${mockPort}/users`, 120_000))) {
    await stopStarted();
    throw new Error(`The mock did not answer: see ${join(logs, "studio.log")}`);
  }
  const port = await freePort();
  const command = target.start.map((part) => part.replace("{port}", String(port)));
  track(startLogged(command, root, { ...env, PORT: String(port) }, join(logs, "app.log")), root);
  const url = `http://localhost:${port}`;
  const steady =
    (await answers(`${url}${target.page}`, 300_000)) && (await settled(`${url}${target.page}`));
  if (!steady) {
    await stopStarted();
    throw new Error(`${url}${target.page} did not answer: see ${join(logs, "app.log")}`);
  }
  return { url, stop: stopStarted };
}
