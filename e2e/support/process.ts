import { type ChildProcess, spawn } from "node:child_process";

/** A process a test started, with what it printed. */
export interface Started {
  output(): string;
  stop(): Promise<void>;
}

/**
 * Start a process in a directory and wait until it prints what says it is
 * ready, or fail with everything it printed.
 *
 * @param command - The program and its arguments
 * @param options - Where it runs, its environment, and what it prints once ready
 * @returns The process, and the text that said it is ready
 * @example
 * ```ts
 * const studio = await startProcess([process.execPath, cli], { cwd, env, ready: /#token=\S+/ });
 * ```
 */
export async function startProcess(
  command: readonly string[],
  options: { cwd: string; env: Record<string, string>; ready: RegExp; timeoutMs?: number },
): Promise<Started & { ready: string }> {
  const [program = process.execPath, ...args] = command;
  const child = spawn(program, args, {
    cwd: options.cwd,
    env: { ...process.env, ...options.env, NO_COLOR: "1", FORCE_COLOR: "0" },
  });
  let output = "";
  child.stdout?.on("data", (chunk: Buffer) => (output += chunk.toString()));
  child.stderr?.on("data", (chunk: Buffer) => (output += chunk.toString()));
  const started = { output: () => output, stop: () => stop(child) };
  const deadline = Date.now() + (options.timeoutMs ?? 60_000);
  while (Date.now() < deadline) {
    const found = options.ready.exec(output)?.[0];
    if (found !== undefined) return { ...started, ready: found };
    if (child.exitCode !== null) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  await stop(child);
  throw new Error(`${command.join(" ")} did not get ready:\n${output}`);
}

async function stop(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise<void>((resolve) => child.once("exit", () => resolve()));
  child.kill("SIGTERM");
  const timer = setTimeout(() => child.kill("SIGKILL"), 10_000);
  await exited;
  clearTimeout(timer);
}
