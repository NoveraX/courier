/**
 * Read every module specifier a source file imports or re-exports, with the
 * hash of the bytes they were read from.
 *
 * Parsing is done by oxc, which reads TypeScript and JSX natively. The
 * TypeScript compiler could do the same, but only if the project has it: it is
 * an optional peer a JavaScript-only project is entitled not to install, and
 * TypeScript 7 publishes no parser under its package root at all. Either
 * absence would leave the watcher tracking the config file alone, so edits to
 * the modules behind it would reload nothing.
 *
 * A file that does not parse cleanly still yields the specifiers oxc did
 * recover, which is what a config being edited looks like between keystrokes.
 *
 * Every load walks the project's modules, and a generated client can be
 * megabytes, so each file is parsed once per content: while its bytes stay
 * the same, the specifiers found the last time are handed back.
 */

import { createLogger } from "@noverax/courier";
import { UNREADABLE } from "./file-content-hash";
import { moduleSpecifiers } from "./module-specifiers";
import { readWatchedBytes } from "./read-watched-bytes";
import { sha256Hex } from "./sha256-hex";

const log = createLogger("Studio");

/** What a module imports, and the bytes that says so. */
export interface ModuleImports {
  /**
   * The sha256 of the raw bytes read, as `contentHashOf` would report them
   * then; `"unreadable"` when the file could not be read.
   */
  readonly contentHash: string;
  /** Specifiers exactly as written, in no particular order. */
  readonly specifiers: readonly string[];
}

const NOTHING_READ: ModuleImports = { contentHash: UNREADABLE, specifiers: [] };

/* One entry per path, replaced when its bytes change, so it holds no more
   entries than the project has modules. Keyed by path rather than by hash
   alone: oxc picks the language from the file name, so equal bytes in a
   `.ts` and a `.tsx` file need not parse alike. */
const parsed = new Map<string, ModuleImports>();

/**
 * Collect the specifiers of every static import, re-export and literal
 * dynamic import in `file`, reading it once.
 *
 * @param file - Absolute path to a TypeScript or JavaScript source file
 * @returns The hash of the bytes read and the specifiers found in them;
 *   no specifiers when the file cannot be read
 *
 * @example
 * ```ts
 * readModuleImports("/app/courier.config.ts");
 * // → { contentHash: "9f86d0…", specifiers: ["@/lib/sources"] }
 * ```
 */
export function readModuleImports(file: string): ModuleImports {
  const bytes = readBytes(file);
  if (bytes === null) return NOTHING_READ;
  const contentHash = sha256Hex(bytes);
  const known = parsed.get(file);
  if (known?.contentHash === contentHash) return known;
  const imports: ModuleImports = {
    contentHash,
    specifiers: moduleSpecifiers(file, bytes.toString("utf8")),
  };
  parsed.set(file, imports);
  return imports;
}

function readBytes(file: string): Buffer | null {
  let bytes: Buffer | null;
  try {
    bytes = readWatchedBytes(file);
  } catch (err) {
    log.warn(`Could not read ${file}, so the modules it imports are not watched`, err);
    return null;
  }
  if (bytes === null) log.warn(`Could not read ${file}, so the modules it imports are not watched`);
  return bytes;
}
