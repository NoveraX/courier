import { type ChildProcess, spawn } from "node:child_process";
import { connect } from "node:net";
import { createInterface } from "node:readline";
import { setTimeout as sleep } from "node:timers/promises";

/** A part of the demo, running in a process of its own. */
export interface Part {
  name: string;
  child: ChildProcess;
  /** Settles when the process has exited, with its code. */
  exited: Promise<number | null>;
}

/**
 * Run a TypeScript entry of the demo in a process of its own, in its own
 * process group — Studio's mocks run beneath it — each line it prints
 * labelled with its name.
 *
 * @param name - What the part is called in the log
 * @param entry - Its entry, relative to the demo's root
 * @param root - The demo's root
 * @param env - What it is told on top of this process's environment
 * @returns The part, running
 * @example
 * ```ts
 * const upstream = startPart("upstream", "src/upstream/main.ts", root);
 * ```
 */
export function startPart(
  name: string,
  entry: string,
  root: string,
  env: Readonly<Record<string, string>> = {},
): Part {
  const child = spawn(process.execPath, ["--import", "tsx", entry], {
    cwd: root,
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
  });
  for (const output of [child.stdout, child.stderr]) {
    if (output)
      createInterface({ input: output }).on("line", (line) => console.log(`[${name}] ${line}`));
  }
  const exited = new Promise<number | null>((resolve) =>
    child.once("exit", (code) => resolve(code)),
  );
  return { name, child, exited };
}

/**
 * Stop a part: ask it to close, and end its whole group — whatever it
 * started — once it has, or once it has had `graceMs` to.
 *
 * @param part - The part
 * @param graceMs - How long it has to close
 * @returns When it is gone
 * @example
 * ```ts
 * await stopPart(studio);
 * ```
 */
export async function stopPart(part: Part, graceMs = 10_000): Promise<void> {
  const { child } = part;
  if (child.exitCode === null && child.signalCode === null) child.kill("SIGTERM");
  await Promise.race([part.exited, sleep(graceMs)]);
  if (child.pid === undefined) return;
  try {
    process.kill(-child.pid, "SIGKILL");
  } catch {
    /* The group is gone already: everything in it closed. */
  }
  await part.exited;
}

/**
 * Wait until something listens on a port of this machine.
 *
 * @param port - The port
 * @param timeoutMs - How long to wait at most
 * @returns When a connection is accepted
 * @throws {Error} When nothing listens within `timeoutMs`
 * @example
 * ```ts
 * await waitForPort(6280, 60_000);
 * ```
 */
export async function waitForPort(port: number, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!(await accepts(port))) {
    if (Date.now() > deadline)
      throw new Error(`Nothing listens on port ${port} after ${timeoutMs} ms`);
    await sleep(250);
  }
}

function accepts(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect({ port, host: "127.0.0.1" });
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
  });
}
