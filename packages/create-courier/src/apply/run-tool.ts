import { spawn } from "node:child_process";

/** How a command ended, and what it printed when its output was kept. */
export interface ToolResult {
  status: number;
  output: string;
}

/**
 * Run a command in the project. Its output goes to the person's terminal
 * as it comes — an install's progress — or is kept and handed back, as a
 * type check's errors are.
 *
 * @param command - The program and its arguments
 * @param cwd - Where it runs
 * @param keep - Keep the output rather than show it
 * @param input - Whether the person at the terminal can answer it: a generator run without questions cannot
 * @returns The exit status, and the output when kept
 * @example
 * ```ts
 * const { status } = await runTool(["npm", "install", "zod"], root, false);
 * ```
 */
export function runTool(
  command: readonly string[],
  cwd: string,
  keep: boolean,
  input: "inherit" | "ignore" = "inherit",
): Promise<ToolResult> {
  const [program = "", ...args] = command;
  return new Promise((done, fail) => {
    /* Windows starts npm, pnpm, yarn and bun through their .cmd shims, which only a shell finds. */
    const child = spawn(program, args, {
      cwd,
      stdio: keep ? ["ignore", "pipe", "pipe"] : [input, "inherit", "inherit"],
      shell: process.platform === "win32",
    });
    let output = "";
    child.stdout?.on("data", (chunk: Buffer) => {
      output += chunk;
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      output += chunk;
    });
    child.on("error", fail);
    child.on("close", (status) => done({ status: status ?? 1, output }));
  });
}
