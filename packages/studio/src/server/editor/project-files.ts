import { execFile } from "node:child_process";
import { readdir } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);

/* Files that may call an endpoint: scripts, and components whose scripts do. */
const CODE = /\.(?:[cm]?[jt]sx?|vue|svelte|astro)$/i;
const DECLARATIONS = /\.d\.[cm]?ts$/i;
/* Outside Git, the folders no one writes calls in: dependencies, builds, caches. */
const SKIPPED = new Set([
  "node_modules",
  ".git",
  ".courier",
  "dist",
  "build",
  "out",
  "coverage",
  ".next",
  ".nuxt",
  ".output",
  ".svelte-kit",
  ".astro",
  ".turbo",
  ".vercel",
  ".expo",
]);
const MOST_FILES = 20_000;

/**
 * The project's code files, relative to its root: those Git tracks or would
 * track — so what `.gitignore` leaves out is left out — or, outside a Git
 * repository, those under the root but in dependencies, builds and caches.
 * At most 20 000.
 *
 * @param root - The project's root
 * @returns The files, with `/` between folders
 * @example
 * ```ts
 * await projectCodeFiles(root); // ["src/api/shop.ts", "src/app/main.ts", …]
 * ```
 */
export async function projectCodeFiles(root: string): Promise<string[]> {
  const listed = await gitFiles(root);
  const files = (listed ?? (await walk(root, root))).filter(
    (file) => CODE.test(file) && !DECLARATIONS.test(file),
  );
  return files.slice(0, MOST_FILES);
}

async function gitFiles(root: string): Promise<string[] | undefined> {
  try {
    const { stdout } = await run(
      "git",
      ["ls-files", "-z", "--cached", "--others", "--exclude-standard"],
      { cwd: root, maxBuffer: 64 * 1024 * 1024, timeout: 15_000 },
    );
    return stdout.split("\0").filter((file) => file !== "");
  } catch {
    /* Not a Git repository, or no Git: the folders are walked instead. */
    return undefined;
  }
}

async function walk(root: string, dir: string, found: string[] = []): Promise<string[]> {
  if (found.length >= MOST_FILES) return found;
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.isDirectory() && !SKIPPED.has(entry.name)) {
      await walk(root, join(dir, entry.name), found);
    } else if (entry.isFile()) {
      found.push(relative(root, join(dir, entry.name)).split(sep).join("/"));
    }
  }
  return found;
}
