import type { ApisRouteDeps } from "../apis-routes";
import type { ApplyReport } from "../import-files/apply-file-plan";
import { type PlanConsent, runPlan } from "../import-files/run-plan";
import { saveImportEntry } from "../import-files/save-import-entry";
import { importsSnapshotOf } from "../imports-bridge";
import { withImportsLock } from "../imports-lock";
import { projectRootAt } from "../project-fs/project-root";
import { readForRemoval } from "../project-state/read-for-removal";
import { type RemovalConfigNotes, removalConfigNotes } from "../removal-config-notes";
import { planImportRemoval } from "../removal-plan";
import { mayTake } from "./may-take";
import { undeclareForRemoval } from "./undeclare-for-removal";

/** What removing an import did. */
export interface RemovalReport
  extends RemovalConfigNotes,
    Pick<ApplyReport, "removed" | "kept" | "backupDir" | "pruneFailures"> {
  success: true;
  /** The config Studio took the import out of; absent when it was not asked to. */
  undeclaredFrom?: string | undefined;
}

/**
 * Remove an import as previewed: with the imports lock held, the file plan
 * is made afresh and checked against what the user saw; when the user asked
 * for it, the import is taken out of courier.config first, while its files
 * are still there to load against; then its files go, all at once, and the
 * import is forgotten. A check or a config change that fails removes nothing.
 *
 * @param deps - The project, and its root
 * @param name - The import
 * @param consent - The plan the user saw, and the steps the user allowed
 * @param configBaseHash - The hash of the config the change to it was shown against; absent to leave the config as it is
 * @returns What was removed, kept and changed, or the error and status for an import Studio does not know
 * @throws {FilePlanError} When the plan is not the one the user saw, or waits for consent
 * @throws {ConfigUndeclareError} When the config changed since the preview, or Studio could not change it
 * @example
 * ```ts
 * const report = await applyImportRemoval(deps, "pets", { planDigest }, preview.config.baseHash);
 * ```
 */
export function applyImportRemoval(
  deps: ApisRouteDeps,
  name: string,
  consent: PlanConsent,
  configBaseHash: string | undefined,
): Promise<RemovalReport | { error: string; status: number }> {
  const { project, projectRoot } = deps;
  /* Read once the lock is held: a request that waited behind a write answers
     for the declaration saved meanwhile, and removes the files that write recorded. */
  return withImportsLock(async () => {
    const { imports, running } = await readForRemoval(project, projectRoot);
    const root = projectRootAt(projectRoot);
    const planned = planImportRemoval(root, name, importsSnapshotOf(imports, projectRoot));
    if ("error" in planned) return planned;
    let undeclaredFrom: string | undefined;
    const report = await runPlan(
      root,
      planned,
      consent,
      (_applied, applyId) => saveImportEntry(root.path, name, null, applyId),
      "required",
      async (applied) => {
        if (configBaseHash === undefined) return;
        const taking = applied.removals.map((removal) => removal.path);
        const request = { name, mayTake: mayTake(planned), taking, baseHash: configBaseHash };
        undeclaredFrom = (await undeclareForRemoval(deps, request)).configFile;
      },
    );
    project.importsChanged();
    const { removed, kept, backupDir, pruneFailures } = report;
    const notes = undeclaredFrom
      ? { configFile: undeclaredFrom, importDeclared: false, configImports: [] }
      : removalConfigNotes(projectRoot, name, running, removed);
    return { success: true, removed, kept, backupDir, pruneFailures, ...notes, undeclaredFrom };
  });
}
