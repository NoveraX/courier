import { type ChildProcess, spawn } from "node:child_process";
import { createWriteStream, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { join } from "node:path";

import type { QuickstartTarget } from "./targets";

/** An app the check started, with Studio beside it, and how to stop both. */
export interface RunningApp {
  readonly url: string;
  /** Stops both, and resolves once their processes have exited. */
  stop(): Promise<void>;
}

/* A command in its own process group, so stopping it stops what it started; its output kept in a log. */
function start(
  command: readonly string[],
  cwd: string,
  env: NodeJS.ProcessEnv,
  log: string,
): ChildProcess {
  const [program = "npx", ...args] = command;
  const child = spawn(program, args, {
    cwd,
    env,
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const out = createWriteStream(log);
  child.stdout?.pipe(out);
  child.stderr?.pipe(out);
  return child;
}

/* Stop a command and what it started, and wait for it to exit: what is still writing must not race the cleanup. */
async function stopGroup(child: ChildProcess): Promise<void> {
  if (child.pid === undefined || child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise<void>((done) => child.once("exit", () => done()));
  const signal = (name: NodeJS.Signals) => {
    try {
      process.kill(-(child.pid ?? 0), name);
    } catch {
      /* The group had ended already. */
    }
  };
  signal("SIGTERM");
  const late = setTimeout(() => signal("SIGKILL"), 10_000);
  await exited;
  clearTimeout(late);
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
 * const { status, output } = await runToEnd(["npx", "--yes", "@noverax/create-courier@latest"], dir, env, log);
 * ```
 */
export function runToEnd(
  command: readonly string[],
  cwd: string,
  env: NodeJS.ProcessEnv,
  log: string,
): Promise<{ status: number; output: string }> {
  return new Promise((done) => {
    const child = start(command, cwd, env, log);
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

/**
 * A port nothing listens on.
 *
 * @returns The port
 * @example
 * ```ts
 * const port = await freePort();
 * ```
 */
export function freePort(): Promise<number> {
  return new Promise((done) => {
    const server = createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address !== null ? address.port : 0;
      server.close(() => done(port));
    });
  });
}

/* Ask an address until it answers 200, or the time runs out. */
async function answers(url: string, within: number): Promise<boolean> {
  const until = Date.now() + within;
  while (Date.now() < until) {
    const status = await fetch(url).then(
      (response) => response.status,
      () => 0,
    );
    if (status === 200) return true;
    await new Promise((done) => setTimeout(done, 1_000));
  }
  return false;
}

/* A dev server may restart once just after it starts — fastify-cli's, as its compiler catches up — so it must answer again a moment later. */
async function settled(url: string): Promise<boolean> {
  await new Promise((done) => setTimeout(done, 5_000));
  return answers(url, 60_000);
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
  const studio = start(["npm", "run", "studio"], root, env, join(logs, "studio.log"));
  const mocks = join(root, "courier.mocks.ts");
  const mockPort = existsSync(mocks)
    ? /port:\s*(\d+)/.exec(readFileSync(mocks, "utf8"))?.[1]
    : undefined;
  if (mockPort && !(await answers(`http://127.0.0.1:${mockPort}/users`, 120_000))) {
    await stopGroup(studio);
    throw new Error(`The mock did not answer: see ${join(logs, "studio.log")}`);
  }
  const port = await freePort();
  const command = target.start.map((part) => part.replace("{port}", String(port)));
  const app = start(command, root, { ...env, PORT: String(port) }, join(logs, "app.log"));
  const url = `http://localhost:${port}`;
  const stop = async () => {
    await Promise.all([stopGroup(app), stopGroup(studio)]);
  };
  const steady =
    (await answers(`${url}${target.page}`, 300_000)) && (await settled(`${url}${target.page}`));
  if (!steady) {
    await stop();
    throw new Error(`${url}${target.page} did not answer: see ${join(logs, "app.log")}`);
  }
  return { url, stop };
}
