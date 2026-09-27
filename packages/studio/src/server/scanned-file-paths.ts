import { createLogger } from "@noverax/courier";
import {
  directoryName,
  type ImportLayout,
  InvalidImportError,
  resolveImportLayout,
} from "../apis/layout";
import { getImportEntry, type ImportsSnapshot } from "./imports-bridge";

const log = createLogger("Studio");

/** Where the source catalogue finds a source's files among those Studio wrote. */
export interface ScannedFilePaths {
  /** The source file, when Studio wrote it. */
  source: string | undefined;
  /** Where the import's generated source is, written or not: the declaration's layout, else the file Studio wrote. */
  generatedSource: string | undefined;
  /** The import's own barrel, when Studio wrote it. */
  index: string | undefined;
  /** A group's endpoint file, or `""` when Studio wrote none for it. */
  group(name: string): string;
}

/**
 * Find a source's files among the ones Studio recorded writing. A declared
 * import's files are looked up at the paths its layout gives them, so a
 * group named like the import is never mistaken for the import's barrel;
 * files written for an import no declaration names yet are matched by name.
 *
 * @param snapshot - The import declarations, with the imports state
 * @param name - The source's name, which is also its import's key
 * @param written - The files Studio recorded writing for it
 * @returns The lookups
 * @example
 * ```ts
 * scannedFilePaths(snapshot, "pets", state.generatedFiles).group("store");
 * // "src/api/pets/store/index.ts"
 * ```
 */
export function scannedFilePaths(
  snapshot: ImportsSnapshot,
  name: string,
  written: readonly string[],
): ScannedFilePaths {
  const layout = layoutOf(snapshot, name);
  const recorded = (path: string): string | undefined =>
    written.includes(path) ? path : undefined;
  if (layout === undefined) {
    const source = written.find((file) => file.endsWith("/source.ts"));
    return {
      source,
      generatedSource: source,
      index: source === undefined ? undefined : recorded(source.replace(/source\.ts$/, "index.ts")),
      group: (group) =>
        written.find((file) => file.endsWith(`/${directoryName(group)}/index.ts`)) ?? "",
    };
  }
  return {
    source: recorded(layout.sourceFile),
    generatedSource: layout.sourceFile,
    index: recorded(layout.indexFile),
    group: (group) => (isBinding(group) ? (recorded(layout.groupFile(group)) ?? "") : ""),
  };
}

function layoutOf(snapshot: ImportsSnapshot, name: string): ImportLayout | undefined {
  const entry = getImportEntry(snapshot, name);
  if (entry === undefined) return undefined;
  try {
    return resolveImportLayout(entry, name);
  } catch (error) {
    if (!(error instanceof InvalidImportError)) throw error;
    log.debug(`The catalogue matches ${name}'s files by name: ${error.message}`);
    return undefined;
  }
}

function isBinding(name: string): boolean {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name);
}
