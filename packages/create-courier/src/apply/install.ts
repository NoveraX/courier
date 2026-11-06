import { SETUP_LIMITS } from "../limits";
import type { Plan } from "../plan/build-plan";
import type { PackageManager } from "../project/package-manager";
import { runTool, toolFailure } from "./run-tool";
import { SetupFailure } from "./setup-failure";

/**
 * The commands that install a plan's packages with the project's package
 * manager: its dependencies, then its dev dependencies with TypeScript's
 * move to 6.0 among them.
 *
 * @param manager - The project's package manager
 * @param plan - The plan
 * @returns Each command, as the program and its arguments
 * @example
 * ```ts
 * installCommands(packageManager("npm"), plan); // [["npm", "install", "@noverax/courier", …], …]
 * ```
 */
export function installCommands(manager: PackageManager, plan: Plan): string[][] {
  const dev = [...plan.devDependencies, ...(plan.typescript ? [plan.typescript.to] : [])];
  return [
    ...(plan.dependencies.length > 0 ? [manager.add(plan.dependencies, false)] : []),
    ...(dev.length > 0 ? [manager.add(dev, true)] : []),
  ];
}

/**
 * Run the install commands in the project, one after another, their
 * output in the terminal, each within the time an install may take.
 *
 * @param root - The project's folder
 * @param commands - The commands
 * @param signal - Stops the install once the person cancels
 * @throws {SetupFailure} `INSTALL_FAILED`, `INSTALL_TIMED_OUT` or `CANCELLED`, naming the command
 * @example
 * ```ts
 * await install(project.root, installCommands(manager, plan), signal);
 * ```
 */
export async function install(
  root: string,
  commands: readonly string[][],
  signal?: AbortSignal,
): Promise<void> {
  for (const command of commands) {
    const result = await runTool(command, {
      cwd: root,
      output: { kind: "show", on: "stdout" },
      deadlineMs: SETUP_LIMITS.installMs,
      signal,
    });
    /* Ctrl+C reaches the package manager too, which may end on its own first: the run was cancelled all the same. */
    const stopped = signal?.aborted === true ? "cancelled" : result.stopped;
    const said = toolFailure(
      command,
      { ...result, ...(stopped ? { stopped } : {}) },
      SETUP_LIMITS.installMs,
    );
    if (stopped === "cancelled") throw new SetupFailure("CANCELLED", said);
    if (stopped === "deadline") throw new SetupFailure("INSTALL_TIMED_OUT", said);
    if (result.status !== 0) throw new SetupFailure("INSTALL_FAILED", said);
  }
}
