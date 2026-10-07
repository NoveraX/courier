import { spawn } from "node:child_process";

/**
 * Run a command to the end, failing with everything it printed when it
 * exits with an error.
 *
 * @param command - The program and its arguments
 * @param options - Where it runs, and the environment it adds
 * @returns What it printed to its standard output, once it exits cleanly
 * @example
 * ```ts
 * await run(["npx", "next", "build"], { cwd: app });
 * ```
 */
export function run(
  command: readonly string[],
  options: { cwd: string; env?: Record<string, string> },
): Promise<string> {
  const [program = "npx", ...args] = command;
  return new Promise((resolve, reject) => {
    const child = spawn(program, args, {
      cwd: options.cwd,
      env: { ...process.env, ...options.env, NO_COLOR: "1", FORCE_COLOR: "0" },
    });
    let output = "";
    let printed = "";
    child.stdout.on("data", (chunk: Buffer) => {
      output += chunk.toString();
      printed += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      output += chunk.toString();
    });
    child.once("error", reject);
    child.once("close", (code) => {
      if (code === 0) resolve(printed);
      else reject(new Error(`${command.join(" ")} exited with ${code}:\n${output}`));
    });
  });
}
