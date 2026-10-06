import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";

/** The repository, whose packages the project resolves through its node_modules. */
export const REPO = resolve(import.meta.dirname, "../..");

/* Inside the repository, so the project's imports find the workspace packages. */
const CACHE = join(REPO, "node_modules/.cache/courier-e2e");

/** A copy of the fixture project for one test file. */
export interface Project {
  root: string;
  read(path: string): string;
  exists(path: string): boolean;
  remove(): void;
}

/**
 * Copy the fixture project for a test file to drive, alone.
 *
 * @param name - What the copy is for, in its folder's name
 * @returns The copy
 * @example
 * ```ts
 * const project = createProject("import");
 * project.read("courier.config.ts");
 * ```
 */
export function createProject(name: string): Project {
  mkdirSync(CACHE, { recursive: true });
  const root = mkdtempSync(join(CACHE, `${name}-`));
  cpSync(join(REPO, "e2e/fixtures/project"), root, { recursive: true });
  return {
    root,
    read: (path) => readFileSync(join(root, path), "utf8"),
    exists: (path) => existsSync(join(root, path)),
    remove: () => rmSync(root, { recursive: true, force: true }),
  };
}
