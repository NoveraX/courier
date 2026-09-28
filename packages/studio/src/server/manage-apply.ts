import { computeSpecHash, createSpecDigest } from "../apis";
import type { ApplyReport } from "./import-files/apply-file-plan";
import { recordAfterApply } from "./import-files/record-after-apply";
import { type PlanConsent, runPlan } from "./import-files/run-plan";
import { saveImportEntry } from "./import-files/save-import-entry";
import type { ImportsSnapshot } from "./imports-bridge";
import { type ManageRequest, planManage } from "./manage-plan";
import type { ProjectRoot } from "./project-fs/project-root";

/**
 * Add and remove endpoints of an import as previewed: the plan is made
 * again from the files on disk and applied only if it is the plan the user
 * saw, then recorded in the imports state.
 *
 * @param body - The import, its spec, the endpoints to add and remove, and the plan the user saw and allowed
 * @param imports - The declarations of the config Studio runs, with the imports state
 * @param root - The project
 * @returns What was written, removed and kept, or the error to answer with and its status
 * @throws {FilePlanError} When the plan is refused as it stands
 * @example
 * ```ts
 * await handleManageApply({ name: "pets", spec, toAdd, toRemove, planDigest }, imports, root);
 * ```
 */
export async function handleManageApply(
  body: ManageRequest & PlanConsent,
  imports: ImportsSnapshot,
  root: ProjectRoot,
): Promise<
  | Pick<ApplyReport, "written" | "removed" | "kept" | "backupDir" | "pruneFailures">
  | { error: string; status: number }
> {
  const planned = planManage(body, imports, root);
  if ("error" in planned) return planned;
  const specHash = body.specHash ?? computeSpecHash(body.spec);
  const spec = { specHash, digest: createSpecDigest(body.spec) };
  const now = new Date().toISOString();
  const report = await runPlan(
    root,
    planned.plan,
    body,
    (applied, applyId) =>
      saveImportEntry(
        root.path,
        body.name,
        recordAfterApply(planned.entry, applied, spec, now),
        applyId,
      ),
    "required",
  );
  const { written, removed, kept, backupDir, pruneFailures } = report;
  return { written, removed, kept, backupDir, pruneFailures };
}
