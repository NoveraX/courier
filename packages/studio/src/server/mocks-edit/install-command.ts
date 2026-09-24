import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { MOCK_PACKAGE } from "./mock-package";

/** What a managed mock server needs installed beside the mocks file. */
const MOCK_PACKAGES = `${MOCK_PACKAGE} hono @hono/node-server`;
const DEFAULT_INSTALLER = "npm install --save-dev";

/** Each lockfile and the command that adds a dev dependency with its package manager. */
const INSTALLERS: ReadonlyArray<readonly [lockfile: string, installer: string]> = [
  ["package-lock.json", DEFAULT_INSTALLER],
  ["pnpm-lock.yaml", "pnpm add -D"],
  ["yarn.lock", "yarn add -D"],
  ["bun.lock", "bun add -d"],
  ["bun.lockb", "bun add -d"],
];

/**
 * The command that installs the mock server's packages with the project's
 * own package manager, told by the nearest lockfile. In a workspace the
 * lockfile sits at its root, so the search walks up from the project to the
 * file system root; with none found it is npm's.
 *
 * @param directory - The project root
 * @returns The command to run there
 * @example
 * ```ts
 * installCommand("/work/app"); // "pnpm add -D @noverax/courier-mock hono @hono/node-server"
 * ```
 */
export function installCommand(directory: string): string {
  return `${installerFor(directory)} ${MOCK_PACKAGES}`;
}

function installerFor(directory: string): string {
  let current = resolve(directory);
  while (true) {
    const found = INSTALLERS.find(([lockfile]) => existsSync(join(current, lockfile)));
    if (found !== undefined) return found[1];
    const parent = dirname(current);
    if (parent === current) return DEFAULT_INSTALLER;
    current = parent;
  }
}
