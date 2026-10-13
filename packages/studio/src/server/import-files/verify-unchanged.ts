import type { ProjectRoot } from "../project-fs/project-root";
import { resolveProjectPath } from "../project-fs/resolve-project-path";
import { readDiskFile } from "./disk-file";
import { FilePlanError } from "./file-plan-error";
import type { FilePlan } from "./file-plan-types";

/**
 * Make sure every file a plan touches is still as the plan found it: a
 * file to create is still absent, a file to replace or remove still holds
 * the body the plan hashed. The plan is refused otherwise, before anything
 * is written.
 *
 * @param root - The project
 * @param plan - The plan about to be applied
 * @throws {FilePlanError} `PLAN_STALE`, naming the files that changed
 */
export function verifyUnchanged(root: ProjectRoot, plan: FilePlan): void {
  const expected = [
    ...plan.writes.map((write) => [write.path, write.priorSha256] as const),
    ...plan.removals.map((removal) => [removal.path, removal.priorSha256] as const),
  ];
  const changed = expected
    .filter(([path, sha256]) => {
      const found = readDiskFile(root, resolveProjectPath(root.path, path));
      return sha256 === undefined
        ? found.kind !== "absent"
        : found.kind !== "file" || found.sha256 !== sha256;
    })
    .map(([path]) => path);
  if (changed.length > 0) {
    throw new FilePlanError(
      "PLAN_STALE",
      `These files changed since the plan was made; look at it again: ${changed.join(", ")}.`,
      { paths: changed },
    );
  }
}
