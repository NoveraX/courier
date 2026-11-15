import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

/**
 * The version this package is released at — that of the docs it holds —
 * read from its own manifest, beside the code as it is installed.
 *
 * @returns The version, or `0.0.0` from a manifest that names none
 * @example
 * ```ts
 * packageVersion(); // "0.4.0"
 * ```
 */
export function packageVersion(): string {
  return versionIn(createRequire(import.meta.url)("../package.json")) ?? "0.0.0";
}

/**
 * The version of `@noverax/courier` the project in `dir` installs: the
 * manifest Node finds from there, as the project's own code does, read as
 * data — nothing of the project runs.
 *
 * @param dir - The project's folder, where an editor starts the server
 * @returns The version, or `undefined` where none is found from there
 * @example
 * ```ts
 * installedCourierVersion(process.cwd()); // "0.6.0"
 * ```
 */
export function installedCourierVersion(dir: string): string | undefined {
  try {
    const manifest = createRequire(join(dir, "package.json")).resolve(
      "@noverax/courier/package.json",
    );
    return versionIn(JSON.parse(readFileSync(manifest, "utf8")));
  } catch {
    return undefined;
  }
}

function versionIn(manifest: unknown): string | undefined {
  if (typeof manifest !== "object" || manifest === null || !("version" in manifest)) {
    return undefined;
  }
  return typeof manifest.version === "string" ? manifest.version : undefined;
}
