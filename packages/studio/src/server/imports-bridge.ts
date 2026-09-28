/**
 * Server-side view of the imports.
 *
 * Pairs the declarations of the `courier.config.ts` Studio runs with the
 * auto-managed state in `.courier/imports-state.json`. The state is written
 * only as the commit of an apply to an import's files.
 */

import type { CourierImportEntry } from "@noverax/courier/config";
import { DEFAULT_OPTIONS } from "../apis/generator/types";
import { type ImportStateEntry, type ImportsState, loadImportsState } from "../apis/imports-state";

/** The `imports` a config declares, by import name. */
export type ImportDeclarations = Record<string, CourierImportEntry>;

export interface ImportsSnapshot {
  declarations: ImportDeclarations;
  state: ImportsState;
}

/** Wire shape consumed by the Studio UI registry views */
export interface ImportSummary {
  name: string;
  specUrl: string;
  importType: "url" | "file" | "raw";
  outputDir: string;
  options: Record<string, unknown>;
}

/**
 * Pair the import declarations of a config with the imports state as it is
 * on disk now.
 *
 * @param declarations - The `imports` of the config Studio runs; none when it runs no config
 * @param root - The project root the state file lives under
 * @returns The snapshot the imports lists and the source catalogue are built from
 *
 * @example
 * ```ts
 * summarizeImports(importsSnapshotOf(loaded.config.imports, root));
 * ```
 */
export function importsSnapshotOf(
  declarations: ImportDeclarations | undefined,
  root: string,
): ImportsSnapshot {
  return { declarations: declarations ?? {}, state: loadImportsState(root) };
}

export function summarizeImports(snapshot: ImportsSnapshot): ImportSummary[] {
  const out: ImportSummary[] = [];
  const seen = new Set<string>();
  for (const [name, entry] of Object.entries(snapshot.declarations)) {
    seen.add(name);
    out.push({
      name,
      specUrl: entry.importType === "url" ? entry.from : "",
      importType: entry.importType,
      outputDir: entry.outputDir,
      options: extractOptions(entry),
    });
  }
  for (const name of Object.keys(snapshot.state.imports)) {
    if (seen.has(name)) continue;
    out.push({ name, specUrl: "", importType: "url", outputDir: "", options: {} });
  }
  return out;
}

/* The options the import is generated with: a setting the declaration
   leaves out is generated with its default, and is shown as that. */
function extractOptions(entry: CourierImportEntry): Record<string, unknown> {
  return {
    sourceName: entry.sourceName,
    outputDir: entry.outputDir,
    validation: entry.validation ?? DEFAULT_OPTIONS.validation,
    groupBy: entry.groupBy ?? DEFAULT_OPTIONS.groupBy,
    generateTypes: entry.generateTypes ?? DEFAULT_OPTIONS.generateTypes,
    generateSchemas: entry.generateSchemas ?? DEFAULT_OPTIONS.generateSchemas,
    generateClient: entry.generateClient ?? DEFAULT_OPTIONS.generateClient,
    addAuthMiddleware: entry.addAuthMiddleware ?? DEFAULT_OPTIONS.addAuthMiddleware,
    includeComments: entry.includeComments ?? DEFAULT_OPTIONS.includeComments,
  };
}

export function getImportEntry(
  snapshot: ImportsSnapshot,
  name: string,
): CourierImportEntry | undefined {
  return Object.hasOwn(snapshot.declarations, name) ? snapshot.declarations[name] : undefined;
}

export function getImportState(
  snapshot: ImportsSnapshot,
  name: string,
): ImportStateEntry | undefined {
  return Object.hasOwn(snapshot.state.imports, name) ? snapshot.state.imports[name] : undefined;
}
