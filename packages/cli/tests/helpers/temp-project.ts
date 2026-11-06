import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const made: string[] = [];

/**
 * A folder on disk holding these files, for a test to read as a project.
 *
 * @param files - Each file's path, `/`-separated, and its text
 * @returns The folder, its links resolved
 */
export function projectWith(files: Readonly<Record<string, string>>): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "courier-cli-")));
  made.push(root);
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  return root;
}

/** Remove every folder `projectWith` made. */
export function removeProjects(): void {
  for (const root of made.splice(0)) rmSync(root, { recursive: true, force: true });
}

/**
 * A package.json, as JSON with two spaces, with the fields given.
 *
 * @param fields - Its fields
 * @returns Its text
 */
export function manifest(fields: object): string {
  return `${JSON.stringify(fields, null, 2)}\n`;
}
