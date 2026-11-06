import { SETUP_LIMITS } from "../limits";
import type { Plan } from "../plan/build-plan";
import type { PackageManager } from "../project/package-manager";
import { runTool, toolFailure } from "./run-tool";

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
 * @throws {Error} When one fails or runs past its time, naming it
 * @example
 * ```ts
 * await install(project.root, installCommands(manager, plan));
 * ```
 */
export async function install(root: string, commands: readonly string[][]): Promise<void> {
  for (const command of commands) {
    const result = await runTool(command, {
      cwd: root,
      output: { kind: "show", on: "stdout" },
      deadlineMs: SETUP_LIMITS.installMs,
    });
    if (result.status !== 0 || result.stopped !== undefined)
      throw new Error(toolFailure(command, result, SETUP_LIMITS.installMs));
  }
}
