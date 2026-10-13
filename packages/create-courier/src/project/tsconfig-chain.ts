import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";

import { isRecord } from "../is-record";
import { parseJsonc } from "./jsonc";

/** A tsconfig's compiler options, and the folder its paths are read from. */
export interface TsconfigLevel {
  readonly options: Readonly<Record<string, unknown>>;
  readonly dir: string;
}

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

function levelsOf(file: string, depth: number): TsconfigLevel[] {
  const parsed = parseJsonc(readFileSync(file, "utf8"));
  if (!isRecord(parsed)) return [];
  const own = {
    options: isRecord(parsed.compilerOptions) ? parsed.compilerOptions : {},
    dir: dirname(file),
  };
  const parents = Array.isArray(parsed.extends) ? parsed.extends : [parsed.extends];
  /* The last base a tsconfig extends wins, so it is read first. */
  const bases = [...parents].reverse().flatMap((parent) => {
    const next = typeof parent === "string" && depth < 5 ? extended(file, parent) : undefined;
    return next === undefined ? [] : levelsOf(next, depth + 1);
  });
  return [own, ...bases];
}

/**
 * The compiler options a project's `tsconfig.json` sets, level by level:
 * its own first, then those of what it extends, a few levels deep, in the
 * order TypeScript lets them win. An option is set by the first level that
 * names it.
 *
 * @param root - The project's folder
 * @returns The levels, or none without a `tsconfig.json`
 * @example
 * ```ts
 * tsconfigChain("/work/shop").find((level) => "baseUrl" in level.options);
 * ```
 */
export function tsconfigChain(root: string): TsconfigLevel[] {
  const tsconfig = join(root, "tsconfig.json");
  return existsSync(tsconfig) ? levelsOf(tsconfig, 0) : [];
}
