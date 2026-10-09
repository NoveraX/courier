import type { Plan } from "../plan/build-plan";
import type { PackageManager } from "../project/package-manager";
import { runTool } from "./run-tool";

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
 * Run the install commands in the project, its output in the terminal.
 *
 * @param root - The project's folder
 * @param commands - The commands
 * @throws {Error} When one fails, naming it
 * @example
 * ```ts
 * await install(project.root, installCommands(manager, plan));
 * ```
 */
export async function install(root: string, commands: readonly string[][]): Promise<void> {
  for (const command of commands) {
    const { status } = await runTool(command, root, false);
    if (status !== 0) throw new Error(`${command.join(" ")} failed (exit ${status})`);
  }
}
