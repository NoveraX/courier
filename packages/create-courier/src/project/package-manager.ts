import { existsSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

/** A package manager the command installs with. */
export type PackageManagerName = "npm" | "pnpm" | "yarn" | "bun";

/** How a package manager adds packages and how the person runs the project's commands with it. */
export interface PackageManager {
  readonly name: PackageManagerName;
  /** The command that adds packages, as dependencies or dev dependencies. */
  add(packages: readonly string[], dev: boolean): string[];
  /** What the person types to run a script: `npm run dev`, `pnpm dev`. */
  run(script: string): string;
  /** The command that runs a program the project installed: `npm exec -- astro sync`. */
  exec(bin: string, args: readonly string[]): string[];
  /** The command that installs what package.json lists. */
  install(): string[];
}

/** Each lockfile, and the package manager it belongs to. */
const LOCKFILES: ReadonlyArray<readonly [string, PackageManagerName]> = [
  ["pnpm-lock.yaml", "pnpm"],
  ["yarn.lock", "yarn"],
  ["bun.lock", "bun"],
  ["bun.lockb", "bun"],
  ["package-lock.json", "npm"],
  ["npm-shrinkwrap.json", "npm"],
];

const NAMES: ReadonlySet<string> = new Set(["npm", "pnpm", "yarn", "bun"]);

function isName(value: string): value is PackageManagerName {
  return NAMES.has(value);
}

/**
 * The package manager that started the command: `npm create`, `pnpm
 * create`, `yarn create` and `bun create` name themselves first in the
 * user agent they hand it.
 *
 * @param agent - The `npm_config_user_agent` the command was started with
 * @returns Its name, or `undefined` when no package manager started it
 * @example
 * ```ts
 * invokingManager("pnpm/10.0.0 npm/? node/v22.12.0 darwin arm64"); // "pnpm"
 * ```
 */
export function invokingManager(
  agent: string | undefined = process.env.npm_config_user_agent,
): PackageManagerName | undefined {
  const name = agent?.split("/", 1)[0] ?? "";
  return isName(name) ? name : undefined;
}

/* The lockfile written last, where a folder has several: a template's own, and the one its install wrote. */
function newest(dir: string, found: ReadonlyArray<readonly [string, PackageManagerName]>) {
  return [...found].sort(
    ([a], [b]) => statSync(join(dir, b)).mtimeMs - statSync(join(dir, a)).mtimeMs,
  )[0];
}

/* The nearest folder at or above the project that holds a lockfile, as a workspace keeps it, and the lockfiles there. */
function lockfilesNear(root: string) {
  for (let current = resolve(root); ; current = dirname(current)) {
    const found = LOCKFILES.filter(([lockfile]) => existsSync(join(current, lockfile)));
    if (found.length > 0) return { dir: current, found };
    if (dirname(current) === current) return undefined;
  }
}

/**
 * The lockfiles a project's installs write, by the rule its package
 * manager is told by: every lockfile's name in the nearest folder at or
 * above the project that holds one — the project's own, or its
 * workspace's — and in the project's folder where none is above it.
 *
 * @param root - The project's folder
 * @returns The paths, absolute, whether or not each is there yet
 * @example
 * ```ts
 * lockfilePaths("/work/shop/apps/web"); // ["/work/shop/pnpm-lock.yaml", …] in a pnpm workspace
 * ```
 */
export function lockfilePaths(root: string): string[] {
  const dir = lockfilesNear(root)?.dir ?? resolve(root);
  return LOCKFILES.map(([lockfile]) => join(dir, lockfile));
}

/**
 * The package manager a project installs with, told by its lockfile: the
 * nearest one at or above the project, where a workspace keeps it. A
 * folder with several — a template that came with one, installed with
 * another — goes by the package manager that started the command, if it
 * is one of them, else by the lockfile written last.
 *
 * @param root - The project's folder
 * @param invoking - The package manager that started the command, if any
 * @returns Its name, or `undefined` when no lockfile is found
 * @example
 * ```ts
 * projectManager("/work/shop"); // "pnpm" beside a pnpm-lock.yaml
 * ```
 */
export function projectManager(
  root: string,
  invoking: PackageManagerName | undefined = invokingManager(),
): PackageManagerName | undefined {
  const near = lockfilesNear(root);
  if (near === undefined) return undefined;
  const { dir, found } = near;
  if (found.length === 1) return found[0]?.[1];
  return found.find(([, name]) => name === invoking)?.[1] ?? newest(dir, found)?.[1];
}

/**
 * A package manager's commands.
 *
 * @param name - The package manager
 * @returns How it adds packages and runs scripts
 * @example
 * ```ts
 * packageManager("pnpm").add(["zod"], true); // ["pnpm", "add", "-D", "zod"]
 * ```
 */
export function packageManager(name: PackageManagerName): PackageManager {
  switch (name) {
    case "pnpm":
      return {
        name,
        add: (p, dev) => ["pnpm", "add", ...(dev ? ["-D"] : []), ...p],
        run: (s) => `pnpm ${s}`,
        exec: (bin, args) => ["pnpm", "exec", bin, ...args],
        install: () => ["pnpm", "install"],
      };
    case "yarn":
      return {
        name,
        add: (p, dev) => ["yarn", "add", ...(dev ? ["-D"] : []), ...p],
        run: (s) => `yarn ${s}`,
        exec: (bin, args) => ["yarn", bin, ...args],
        install: () => ["yarn", "install"],
      };
    case "bun":
      return {
        name,
        add: (p, dev) => ["bun", "add", ...(dev ? ["-d"] : []), ...p],
        run: (s) => `bun run ${s}`,
        exec: (bin, args) => ["bun", "x", bin, ...args],
        install: () => ["bun", "install"],
      };
    default:
      return {
        name,
        add: (p, dev) => ["npm", "install", ...(dev ? ["--save-dev"] : []), ...p],
        run: (s) => `npm run ${s}`,
        exec: (bin, args) => ["npm", "exec", "--", bin, ...args],
        install: () => ["npm", "install"],
      };
  }
}

/**
 * The package manager a setup installs with: the one `--package-manager`
 * names, else the project's — by its lockfile or `packageManager` — else
 * the one the command was run with, else npm.
 *
 * @param root - The project's folder
 * @param asked - What `--package-manager` names, if anything
 * @returns The package manager
 * @throws {Error} When `--package-manager` names one the command does not know
 * @example
 * ```ts
 * managerFor("/work/shop", undefined).name; // "pnpm" in a project with pnpm-lock.yaml
 * ```
 */
export function managerFor(root: string, asked: string | undefined): PackageManager {
  if (asked === undefined)
    return packageManager(projectManager(root) ?? invokingManager() ?? "npm");
  if (asked === "npm" || asked === "pnpm" || asked === "yarn" || asked === "bun")
    return packageManager(asked);
  throw new Error(`--package-manager takes npm, pnpm, yarn or bun, not "${asked}"`);
}
