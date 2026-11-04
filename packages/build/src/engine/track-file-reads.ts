import { createRequire, syncBuiltinESMExports } from "node:module";
import { sep } from "node:path";
import { fileURLToPath } from "node:url";

import { isRecord } from "../util/is-record";
import { localPath } from "../util/local-path";

const require = createRequire(import.meta.url);

/** The paths code read through `fs` since tracking began. */
export interface FileReads {
  /** The files it read and the paths it looked at, absolute. */
  paths(): string[];
  /** The folders whose entries it listed, absolute. */
  folders(): string[];
}

/* The functions that read a file or look at a path, and those that list a folder. */
const READS = [
  "readFileSync",
  "readFile",
  "createReadStream",
  "existsSync",
  "statSync",
  "lstatSync",
  "stat",
  "lstat",
  "accessSync",
  "access",
] as const;
const LISTS = ["readdirSync", "readdir", "opendirSync", "opendir"] as const;
const PROMISED_READS = ["readFile", "stat", "lstat", "access"] as const;
const PROMISED_LISTS = ["readdir", "opendir"] as const;

/**
 * Note every path the code that runs next reads or looks at through `fs`,
 * and every folder it lists: a config that reads an OpenAPI document, or
 * builds its sources from a folder's entries, depends on them as on the
 * modules it imports. Each path is noted as the system names it, however
 * the code wrote it. Installed packages are left out, as the install
 * changes them, and so is anything `fs` is handed that names no path.
 *
 * @returns What was read, asked once the code has run
 * @example
 * ```ts
 * const reads = trackFileReads();
 * readFileSync("./openapi.json");
 * reads.paths(); // ["/app/openapi.json"]
 * ```
 */
export function trackFileReads(): FileReads {
  const paths = new Set<string>();
  const folders = new Set<string>();
  /* The modules themselves, which hold the functions every importer of them calls. */
  const fs: unknown = require("node:fs");
  const promises: unknown = require("node:fs/promises");
  if (isRecord(fs)) {
    noteCalls(fs, READS, paths);
    noteCalls(fs, LISTS, folders);
  }
  if (isRecord(promises)) {
    noteCalls(promises, PROMISED_READS, paths);
    noteCalls(promises, PROMISED_LISTS, folders);
  }
  /* The named exports an ES module imports `fs` by follow the functions put in place here. */
  syncBuiltinESMExports();
  return { paths: () => [...paths], folders: () => [...folders] };
}

/* Each function, put back in place so that its first argument is noted before it runs. */
function noteCalls(
  target: Record<string, unknown>,
  names: readonly string[],
  noted: Set<string>,
): void {
  for (const name of names) {
    const original = target[name];
    if (typeof original !== "function") continue;
    target[name] = Object.assign(function (this: unknown, ...args: unknown[]): unknown {
      const path = pathOf(args[0]);
      if (path !== undefined && !path.split(sep).includes("node_modules")) noted.add(path);
      return Reflect.apply(original, this, args);
    }, original);
  }
}

/* The path an argument names, as the system names it: a string, a `file:` URL or a buffer of one; a descriptor names none. */
function pathOf(value: unknown): string | undefined {
  if (typeof value === "string") return localPath(value);
  if (value instanceof URL) return value.protocol === "file:" ? fileURLToPath(value) : undefined;
  if (Buffer.isBuffer(value)) return pathOf(value.toString());
  return undefined;
}
