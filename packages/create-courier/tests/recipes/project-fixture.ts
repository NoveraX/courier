import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { importExtension } from "../../src/project/module-style";
import { packageManager } from "../../src/project/package-manager";
import { readProject } from "../../src/project/read-project";
import type { RecipeContext, SetupChoices } from "../../src/recipes/recipe-types";

const made: string[] = [];

/** A project on disk with these files, for a recipe to read. */
export function projectWith(files: Readonly<Record<string, string>>): string {
  const root = mkdtempSync(join(tmpdir(), "create-courier-"));
  made.push(root);
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
  return root;
}

/** Removes every project `projectWith` made. */
export function removeProjects(): void {
  for (const root of made.splice(0)) rmSync(root, { recursive: true, force: true });
}

/** What a recipe reads, for a project made with `projectWith`. */
export function contextOf(
  root: string,
  marker: string,
  choices: Partial<SetupChoices> = {},
  ports = { studio: 6280, mock: 7001 },
): RecipeContext {
  const project = readProject(root);
  return {
    project,
    manager: packageManager("npm"),
    choices: { studio: true, mocks: true, mcp: false, ...choices },
    extension: importExtension(root),
    version: project.version(marker),
    ports,
    fresh: false,
  };
}

/** A package.json listing these packages, as dependencies. */
export function manifest(
  dependencies: Readonly<Record<string, string>>,
  extra: object = {},
): string {
  return `${JSON.stringify({ name: "app", private: true, ...extra, dependencies }, null, 2)}\n`;
}
