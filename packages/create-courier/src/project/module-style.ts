import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";

import { isRecord } from "../is-record";
import { parseJsonc } from "./jsonc";

/* Where an `extends` leads: a path beside the file, or a package's tsconfig. */
function extended(from: string, name: string): string | undefined {
  if (name.startsWith(".")) {
    const path = resolve(dirname(from), name);
    return existsSync(path) ? path : existsSync(`${path}.json`) ? `${path}.json` : undefined;
  }
  try {
    return createRequire(from).resolve(name.endsWith(".json") ? name : `${name}/tsconfig.json`);
  } catch {
    /* A base that is not installed sets nothing the project can be read by; TypeScript itself would refuse the project. */
    return undefined;
  }
}

/* The module resolution a tsconfig sets, following what it extends a few levels deep. */
function resolutionOf(file: string, depth: number): string | undefined {
  const parsed = parseJsonc(readFileSync(file, "utf8"));
  if (!isRecord(parsed)) return undefined;
  const options = isRecord(parsed.compilerOptions) ? parsed.compilerOptions : {};
  const own = options.moduleResolution ?? options.module;
  if (typeof own === "string") return own.toLowerCase();
  const parents = Array.isArray(parsed.extends) ? parsed.extends : [parsed.extends];
  /* The last base a tsconfig extends wins, so it is read first. */
  for (const parent of [...parents].reverse()) {
    const next = typeof parent === "string" && depth < 5 ? extended(file, parent) : undefined;
    const found = next === undefined ? undefined : resolutionOf(next, depth + 1);
    if (found !== undefined) return found;
  }
  return undefined;
}

/**
 * The extension the project's relative imports carry: `.js` where
 * TypeScript resolves modules as Node does — `node16` or `nodenext` —
 * which asks for it, and none where a bundler resolves them.
 *
 * @param root - The project's folder
 * @returns `.js` or nothing
 * @example
 * ```ts
 * importExtension("/work/api"); // ".js" under "module": "nodenext"
 * ```
 */
export function importExtension(root: string): "" | ".js" {
  const tsconfig = join(root, "tsconfig.json");
  if (!existsSync(tsconfig)) return "";
  const resolution = resolutionOf(tsconfig, 0);
  return resolution === "node16" || resolution === "nodenext" ? ".js" : "";
}
