import type { CourierImportEntry } from "@noverax/courier/config";
import type { ProjectRoot } from "@noverax/courier-cli/devkit";
import type { ImportStateEntry } from "../apis/imports-state";
import { type ImportLayout, InvalidImportError, resolveImportLayout } from "../apis/layout";
import { formerFolder } from "./former-folder";
import { claimedFiles } from "./import-files/claimed-files";
import type { FilePlan } from "./import-files/file-plan-types";
import { planFiles } from "./import-files/plan-files";
import { ImportRenamedError } from "./import-renamed-error";
import { getImportEntry, getImportState, type ImportsSnapshot } from "./imports-bridge";

/**
 * Plan removing an import: every file Studio recorded writing for it, and
 * every file in its directory Studio's header claims for it, is no longer
 * wanted — removed if it is Studio's own and untouched, held for the user
 * if it was edited or only claimed, and left if it is not Studio's. An
 * import Studio 0.3.0 bound under a name this release gives it no more is
 * removed from the folder that release wrote, while that folder holds its
 * files: removing it, and importing it again, is how it takes its new name.
 *
 * @param root - The project
 * @param name - The import
 * @param imports - The declarations, with the imports state
 * @returns The plan, or the error to answer with and its status when Studio knows no such import
 * @throws {ImportRenamedError} When both that folder and the one this release writes hold its files
 */
export function planImportRemoval(
  root: ProjectRoot,
  name: string,
  imports: ImportsSnapshot,
): FilePlan | { error: string; status: number } {
  const entry = getImportEntry(imports, name);
  const state = getImportState(imports, name);
  if (!entry && !state) return { error: `Import "${name}" not found`, status: 404 };
  /* The declaration says where the import is; the state only where Studio last wrote it. */
  const dir = removedDir(root, name, entry, state);
  const recorded = Object.keys(state?.files ?? {}).filter((path) => path.startsWith(`${dir}/`));
  const candidates = new Set([
    ...recorded,
    ...(dir === undefined ? [] : claimedFiles(root, dir, name)),
  ]);
  return planFiles(
    root,
    { importName: name, dir: dir ?? "", targets: [], removals: [...candidates] },
    state?.files ?? {},
  );
}

function removedDir(
  root: ProjectRoot,
  name: string,
  entry: CourierImportEntry | undefined,
  state: ImportStateEntry | undefined,
): string | undefined {
  const layout = entry && declaredLayout(entry, name);
  if (entry === undefined || layout === undefined) return state?.dir;
  const former = formerFolder(root, name, entry, layout.dir, state);
  if (former === undefined) return layout.dir;
  if (former.inBoth) {
    throw new ImportRenamedError(name, former, { binding: layout.sourceBinding, dir: layout.dir });
  }
  return former.dir;
}

function declaredLayout(entry: CourierImportEntry, name: string): ImportLayout | undefined {
  try {
    return resolveImportLayout(entry, name);
  } catch (error) {
    if (error instanceof InvalidImportError) return undefined;
    throw error;
  }
}
