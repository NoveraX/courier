import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { createLogger } from "@noverax/courier";

import { UNREADABLE } from "./file-content-hash";
import { sha256Hex } from "./file-hash";
import { firstMissingPath } from "./first-missing-path";
import { readTsconfigLinks } from "./read-tsconfig-links";
import { readWatchedBytes } from "./read-watched-bytes";
import { resolveTsconfigExtends } from "./resolve-tsconfig-extends";

const log = createLogger("Studio");

const TSCONFIG = "tsconfig.json";

/**
 * Read every file the path-alias reader consults for the modules in
 * `directory` — `readPathAliases` of `@noverax/courier-studio-core`, which
 * both the dependency walk and the module loader call on every load — with
 * the hash of what each held.
 *
 * That is the nearest `tsconfig.json` at or above the directory, and each
 * file down its `extends` chain until one declares `compilerOptions.paths`
 * or has an `extends` entry the reader fails on, as the reader goes (see
 * `readTsconfigLinks`). A path the reader looks at and finds absent is
 * recorded absent where creating it would change the file it takes: a
 * `tsconfig.json` nearer than the one found, or a file an `extends` names.
 * When no `tsconfig.json` is found at all, only the directory's own is: a
 * watch on every directory up to the root of the file system would follow
 * changes made far outside the project.
 *
 * Each file is read once, and its hash is that read's, so a save that lands
 * after it differs from what is recorded here, whatever the reader read.
 *
 * @param directory - The directory of the config or the mocks file, symlinks resolved
 * @returns Each path and the hash of what it held: the sha256 of its bytes,
 *   `null` when absent, `"unreadable"` when it could not be read
 *
 * @example
 * ```ts
 * readTsconfigInputs("/app");
 * // → Map { "/app/tsconfig.json" => "9f86d0…", "/app/tsconfig.base.json" => "2c26b4…" }
 * ```
 */
export function readTsconfigInputs(directory: string): Map<string, string | null> {
  const inputs = new Map<string, string | null>();
  const nearest = findNearest(resolve(directory), inputs);
  if (nearest !== null) consult(nearest, inputs, new Set());
  return inputs;
}

function findNearest(directory: string, inputs: Map<string, string | null>): string | null {
  const nearer: string[] = [];
  for (let dir = directory; ; dir = dirname(dir)) {
    const candidate = join(dir, TSCONFIG);
    if (existsSync(candidate)) {
      for (const path of nearer) recordAbsent(inputs, path);
      return candidate;
    }
    nearer.push(candidate);
    if (dirname(dir) === dir) break;
  }
  recordAbsent(inputs, join(directory, TSCONFIG));
  return null;
}

/** Record `file` and follow its `extends`; true once the reader's search ends. */
function consult(file: string, inputs: Map<string, string | null>, visited: Set<string>): boolean {
  const path = resolve(file);
  if (visited.has(path)) return false;
  visited.add(path);
  const { hash, text } = readText(path);
  inputs.set(path, hash);
  if (text === null) return false;
  const links = readTsconfigLinks(text);
  if (links.declaresPaths) return true;
  /* A later entry of an `extends` array overrides an earlier one. The reader
     fails at an entry that is no string, so the search ends there too. */
  for (const specifier of [...links.extends].reverse()) {
    if (specifier === null) return true;
    const parent = resolveTsconfigExtends(specifier, dirname(path));
    for (const absent of parent.absent) recordAbsent(inputs, absent);
    if (parent.file !== null && consult(parent.file, inputs, visited)) return true;
  }
  return false;
}

function readText(path: string): { hash: string | null; text: string | null } {
  let bytes: Buffer | null;
  try {
    bytes = readWatchedBytes(path);
  } catch (error) {
    log.debug(`Could not read ${path}, so the files it extends are not watched`, error);
    return { hash: UNREADABLE, text: null };
  }
  if (bytes === null) return { hash: null, text: null };
  return { hash: sha256Hex(bytes), text: bytes.toString("utf8") };
}

function recordAbsent(inputs: Map<string, string | null>, path: string): void {
  const watchable = firstMissingPath(path);
  if (watchable !== null && !inputs.has(watchable)) inputs.set(watchable, null);
}
