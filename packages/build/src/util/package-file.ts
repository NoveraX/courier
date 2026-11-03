import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** The package this module ships in, by the name its manifest gives. */
const PACKAGE_NAME = "@noverax/courier-build";

let root: string | null | undefined;

/**
 * A file this package ships, by its path from the package's root: the
 * folder above this module that holds the manifest with the package's
 * name, wherever this module was bundled into.
 *
 * @param path - The file, from the package's root
 * @returns The file, absolute; none when no folder above holds the manifest
 * @example
 * ```ts
 * packageFile("lib/engine/worker.js"); // "/app/node_modules/@noverax/courier-build/lib/engine/worker.js"
 * ```
 */
export function packageFile(path: string): string | undefined {
  root ??= packageRoot() ?? null;
  return root === null ? undefined : join(root, path);
}

function packageRoot(): string | undefined {
  let dir = dirname(fileURLToPath(import.meta.url));
  while (!isPackageRoot(dir)) {
    const parent = dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
  return dir;
}

function isPackageRoot(dir: string): boolean {
  const manifest = join(dir, "package.json");
  if (!existsSync(manifest)) return false;
  const parsed: unknown = JSON.parse(readFileSync(manifest, "utf8"));
  return (
    typeof parsed === "object" && parsed !== null && Reflect.get(parsed, "name") === PACKAGE_NAME
  );
}
