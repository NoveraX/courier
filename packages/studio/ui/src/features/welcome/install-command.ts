/** A package manager the setup can show its install command for. */
export type PackageManager = "npm" | "pnpm" | "bun";

/** The package managers, in the order the setup offers them. */
export const PACKAGE_MANAGERS: readonly PackageManager[] = ["npm", "pnpm", "bun"];

const ADD: Readonly<Record<PackageManager, { dev: string; prod: string }>> = {
  npm: { dev: "npm install -D", prod: "npm install" },
  pnpm: { dev: "pnpm add -D", prod: "pnpm add" },
  bun: { dev: "bun add -d", prod: "bun add" },
};

/**
 * The install step's commands for a package manager, from the setup's npm
 * commands: `npm install -D x` becomes `pnpm add -D x` or `bun add -d x`, and
 * `npm install x` the same without the dev flag.
 *
 * @param npmCommands - The step's commands, one per line, as written for npm
 * @param manager - The package manager to write them for
 * @returns The commands, one per line
 * @example
 * ```ts
 * installCommand("npm install -D @noverax/courier-studio", "pnpm");
 * // → "pnpm add -D @noverax/courier-studio"
 * ```
 */
export function installCommand(npmCommands: string, manager: PackageManager): string {
  return npmCommands
    .split("\n")
    .map((line) => {
      const dev = line.match(/^npm install -D (.+)$/);
      if (dev) return `${ADD[manager].dev} ${dev[1]}`;
      const prod = line.match(/^npm install (.+)$/);
      return prod ? `${ADD[manager].prod} ${prod[1]}` : line;
    })
    .join("\n");
}
