import { assertResolvesInside } from "../project-fs/assert-resolves-inside";
import { PathOutsideProjectError } from "../project-fs/path-outside-project-error";
import type { ProjectRoot } from "../project-fs/project-root";
import { resolveProjectPath } from "../project-fs/resolve-project-path";
import { type DiskFile, readDiskFile } from "./disk-file";
import type { FilePlan, PlanRequest } from "./file-plan-types";
import { ownershipOf } from "./ownership";
import { planDigest } from "./plan-digest";
import { planRemoval } from "./plan-removal";
import { planTarget } from "./plan-target";
import type { RecordedFile } from "./recorded-file";

/**
 * Work out, without touching anything, what an operation does to an
 * import's files: which it writes and how, which it removes, which it
 * leaves alone and why, which wait for the user to allow them, and which
 * it cannot write at all. Every path must lie in the import's directory.
 * A file the operation would remove that is, on disk, the very file one of
 * its targets names — another spelling of the same path — is forgotten,
 * never removed.
 *
 * @param root - The project
 * @param request - The import, its directory, the files wanted and the files no longer wanted
 * @param recorded - What Studio recorded writing for the import, by path
 * @returns The plan, with the digest of everything it rests on
 * @throws {PathOutsideProjectError} When a path lies outside the import's directory
 * @example
 * ```ts
 * const plan = planFiles(root, { importName: "pets", dir: layout.dir, targets, removals }, entry.files);
 * ```
 */
export function planFiles(
  root: ProjectRoot,
  request: PlanRequest,
  recorded: Readonly<Record<string, RecordedFile>>,
): FilePlan {
  const recordFor = (path: string) => (Object.hasOwn(recorded, path) ? recorded[path] : undefined);
  const plan: Omit<FilePlan, "digest"> = {
    importName: request.importName,
    dir: request.dir,
    writes: [],
    removals: [],
    kept: [],
    pending: [],
    blocked: [],
    forgotten: [],
  };
  const targetIdentities = new Set<string>();
  for (const target of request.targets) {
    const disk = diskAt(root, request.dir, target.path);
    if (disk.kind === "file") targetIdentities.add(identityOf(disk));
    const record = recordFor(target.path);
    const outcome = planTarget(target, disk, ownershipOf(disk, record, request.importName), record);
    if ("blocked" in outcome) plan.blocked.push({ path: target.path, reason: outcome.blocked });
    else if (outcome.confirm)
      plan.pending.push({ confirmation: outcome.confirm, write: outcome.write });
    else plan.writes.push(outcome.write);
  }
  const targetPaths = new Set(request.targets.map((target) => target.path));
  for (const path of new Set(request.removals)) {
    if (targetPaths.has(path)) continue;
    const disk = diskAt(root, request.dir, path);
    if (disk.kind === "file" && targetIdentities.has(identityOf(disk))) {
      plan.forgotten.push(path);
      continue;
    }
    const record = recordFor(path);
    const outcome = planRemoval(path, disk, ownershipOf(disk, record, request.importName), record);
    if ("forget" in outcome) plan.forgotten.push(path);
    else if ("keep" in outcome) plan.kept.push({ path, reason: outcome.keep });
    else if (outcome.confirm)
      plan.pending.push({ confirmation: outcome.confirm, removal: outcome.remove });
    else plan.removals.push(outcome.remove);
  }
  return { ...plan, digest: planDigest(plan) };
}

function diskAt(root: ProjectRoot, dir: string, path: string): DiskFile {
  if (!path.startsWith(`${dir}/`)) {
    throw new PathOutsideProjectError(path, "it lies outside the import's directory");
  }
  const absolute = resolveProjectPath(root.path, path);
  try {
    assertResolvesInside(root, absolute);
  } catch (error) {
    if (error instanceof PathOutsideProjectError) return { kind: "link" };
    throw error;
  }
  return readDiskFile(absolute);
}

function identityOf(disk: Extract<DiskFile, { kind: "file" }>): string {
  return `${disk.identity.dev}:${disk.identity.ino}`;
}
