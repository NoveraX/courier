/** The package managers a project's lockfile can name. */
export type PackageManager = "npm" | "pnpm" | "yarn" | "bun";

/** The lockfile each package manager writes. */
export const LOCKFILES: ReadonlyMap<string, PackageManager> = new Map([
  ["pnpm-lock.yaml", "pnpm"],
  ["yarn.lock", "yarn"],
  ["bun.lock", "bun"],
  ["bun.lockb", "bun"],
  ["package-lock.json", "npm"],
]);

/* A script of the project's own that starts Courier Studio, as create-courier writes it. */
const STUDIO_SCRIPT = /(^|[\s;&|])courier-studio(\s|$)/;

/**
 * The command that starts Courier Studio for a project, in its own terminal:
 * the project's `studio` script when it runs Courier Studio — so the port
 * and flags the project chose apply — through the package manager its
 * lockfile names, and otherwise the package by its full name. A `studio`
 * script that runs another tool, such as Prisma Studio, is left alone.
 *
 * @param manager - The package manager the project's lockfile names
 * @param scripts - The `scripts` of the project's `package.json`
 * @returns The command line
 * @example
 * ```ts
 * studioCommand("pnpm", { studio: "courier-studio" }); // "pnpm run studio"
 * studioCommand("npm", { studio: "prisma studio" }); // "npx @noverax/courier-studio"
 * ```
 */
export function studioCommand(
  manager: PackageManager,
  scripts: Readonly<Record<string, unknown>>,
): string {
  const script = scripts.studio;
  if (typeof script !== "string" || !STUDIO_SCRIPT.test(script)) {
    return "npx @noverax/courier-studio";
  }
  if (manager === "yarn") return "yarn studio";
  return `${manager} run studio`;
}

/**
 * The package manager a project uses: the one whose lockfile is found
 * first, from the project's folder up to the workspace's, npm when none is.
 *
 * @param found - The lockfiles found, nearest folder first, each folder's in any order
 * @returns The package manager
 * @example
 * ```ts
 * packageManagerOf([["package.json"], ["pnpm-lock.yaml"]]); // "pnpm"
 * ```
 */
export function packageManagerOf(found: readonly (readonly string[])[]): PackageManager {
  for (const files of found) {
    for (const file of files) {
      const manager = LOCKFILES.get(file);
      if (manager) return manager;
    }
  }
  return "npm";
}
