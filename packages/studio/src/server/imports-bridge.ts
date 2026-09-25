/**
 * Server-side facade for import persistence.
 *
 * Pairs the declarations of the `courier.config.ts` Studio runs with the
 * auto-managed state in `.courier/imports-state.json`. The single entry
 * point for every server route or helper that needs to read or mutate
 * import metadata.
 */

import type { CourierImportEntry } from "@noverax/courier/config";
import {
  type ImportStateEntry,
  type ImportsState,
  loadImportsState,
  recordImport,
  removeImport,
  saveImportsState,
} from "../apis/imports-state";
import { getProjectRoot } from "../context";
import { getEffectiveDir as joinEffectiveDir } from "./fs-helpers";
import { withImportsLock } from "./imports-lock";

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

function extractOptions(entry: CourierImportEntry): Record<string, unknown> {
  return {
    sourceName: entry.sourceName,
    outputDir: entry.outputDir,
    validation: entry.validation,
    groupBy: entry.groupBy,
    generateTypes: entry.generateTypes,
    generateSchemas: entry.generateSchemas,
    generateClient: entry.generateClient,
    addAuthMiddleware: entry.addAuthMiddleware,
    includeComments: entry.includeComments,
  };
}

/**
 * Atomically upsert a single import's state entry. Self-locks via
 * `withImportsLock`, which is reentrant: calling this from inside a
 * route-level lock composes cleanly and still serializes against other
 * top-level writers.
 */
export async function persistImportState(name: string, entry: ImportStateEntry): Promise<void> {
  await withImportsLock(() => {
    const root = getProjectRoot();
    saveImportsState(root, recordImport(loadImportsState(root), name, entry));
  });
}

/** Atomically drop a single import's state entry. Self-locks. */
export async function dropImportState(name: string): Promise<void> {
  await withImportsLock(() => {
    const root = getProjectRoot();
    saveImportsState(root, removeImport(loadImportsState(root), name));
  });
}

/**
 * Canonical helper that resolves the on-disk directory where Studio writes
 * an import's generated files. Callers MUST route through this single
 * helper so the `outputDir/sourceName` convention stays consistent.
 */
export function getEffectiveImportDir(
  entry: { outputDir: string; sourceName?: string },
  name: string,
): string {
  return joinEffectiveDir(entry.outputDir, entry.sourceName ?? name);
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

/**
 * Format a `courier.config.ts` snippet the user can paste under `imports:`.
 * URL imports carry `from` / `auth` / `pinHash`; file and raw imports are
 * supplied through the UI each time and therefore have no `from`.
 */
export function formatImportSnippet(name: string, entry: CourierImportEntry): string {
  const lines: string[] = [`  ${JSON.stringify(name)}: {`];
  lines.push(`    importType: ${JSON.stringify(entry.importType)},`);
  lines.push(`    type: ${JSON.stringify(entry.type)},`);
  if (entry.importType === "url") {
    lines.push(`    from: ${JSON.stringify(entry.from)},`);
    if (entry.auth) lines.push(`    auth: ${JSON.stringify(entry.auth)},`);
    if (entry.pinHash) lines.push(`    pinHash: ${JSON.stringify(entry.pinHash)},`);
  }
  lines.push(`    outputDir: ${JSON.stringify(entry.outputDir)},`);
  if (entry.sourceName) lines.push(`    sourceName: ${JSON.stringify(entry.sourceName)},`);
  lines.push("  },");
  return lines.join("\n");
}
