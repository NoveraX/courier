import type { CourierImportEntry } from "@noverax/courier/config";
import { InvalidImportError, resolveImportLayout } from "../apis/layout";
import { claimedFiles } from "./import-files/claimed-files";
import type { FilePlan } from "./import-files/file-plan-types";
import { planFiles } from "./import-files/plan-files";
import { getImportEntry, getImportState, type ImportsSnapshot } from "./imports-bridge";
import type { ProjectRoot } from "./project-fs/project-root";

/**
 * Plan removing an import: every file Studio recorded writing for it, and
 * every file in its directory Studio's header claims for it, is no longer
 * wanted — removed if it is Studio's own and untouched, held for the user
 * if it was edited or only claimed, and left if it is not Studio's.
 *
 * @param root - The project
 * @param name - The import
 * @param imports - The declarations, with the imports state
 * @returns The plan, or the error to answer with and its status when Studio knows no such import
 */
export function planImportRemoval(
  root: ProjectRoot,
  name: string,
  imports: ImportsSnapshot,
): FilePlan | { error: string; status: number } {
  const entry = getImportEntry(imports, name);
  const state = getImportState(imports, name);
  if (!entry && !state) return { error: `Import "${name}" not found`, status: 404 };
  const dir = state?.dir ?? declaredDir(entry, name);
  const candidates = new Set([
    ...Object.keys(state?.files ?? {}),
    ...(dir === undefined ? [] : claimedFiles(root, dir, name)),
  ]);
  return planFiles(
    root,
    { importName: name, dir: dir ?? "", targets: [], removals: [...candidates] },
    state?.files ?? {},
  );
}

function declaredDir(entry: CourierImportEntry | undefined, name: string): string | undefined {
  if (!entry) return undefined;
  try {
    return resolveImportLayout(entry, name).dir;
  } catch (error) {
    if (error instanceof InvalidImportError) return undefined;
    throw error;
  }
}
