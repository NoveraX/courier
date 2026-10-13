import { posix, relative, sep } from "node:path";
import { moduleSpecifiers } from "../module-specifiers";
import type { ProjectRoot } from "../project-fs/project-root";
import { resolveProjectPath } from "../project-fs/resolve-project-path";
import { readDiskFile } from "./disk-file";
import type { FilePlan } from "./file-plan-types";
import { walkTsFiles } from "./walk-ts-files";

/**
 * Keep every file a plan removes that a file staying in the import's folder
 * imports, and what that file imports in turn. A file stays when the plan
 * writes it, or leaves it as it is — one the user did not allow to go, one
 * Studio did not write. Removing a group's files without the edited one the
 * user kept took its schemas away, and the project stopped compiling.
 *
 * Only relative specifiers are followed, and only to files the plan would
 * remove; a file kept for this is kept with the reason `imported`.
 *
 * @param root - The project
 * @param plan - The plan as it will be applied, every consent taken in
 * @returns The plan without those removals, which it keeps instead
 * @example
 * ```ts
 * const applied = keepImported(root, withConfirmations(plan, consent.confirm ?? []));
 * ```
 */
export function keepImported(root: ProjectRoot, plan: FilePlan): FilePlan {
  const removing = new Set(plan.removals.map((removal) => removal.path));
  if (removing.size === 0) return plan;
  const staying = new Set([
    ...filesInDir(root, plan.dir),
    ...plan.writes.map((write) => write.path),
  ]);
  const imported = importedAmong(removing, [...staying], textReader(root, plan));
  if (imported.size === 0) return plan;
  return {
    ...plan,
    removals: plan.removals.filter((removal) => !imported.has(removal.path)),
    kept: [...plan.kept, ...[...imported].map((path) => ({ path, reason: "imported" as const }))],
  };
}

/* The project-relative `.ts` files in the import's folder as they are on disk. */
function filesInDir(root: ProjectRoot, dir: string): string[] {
  const found: string[] = [];
  walkTsFiles(resolveProjectPath(root.path, dir), (file) => {
    found.push(relative(root.path, file).split(sep).join("/"));
  });
  return found;
}

/* A file's text once the plan is applied: what the plan writes, or what is on disk. */
function textReader(root: ProjectRoot, plan: FilePlan): (path: string) => string | null {
  const written = new Map(plan.writes.map((write) => [write.path, write.body]));
  return (path) => {
    const body = written.get(path);
    if (body !== undefined) return body;
    const disk = readDiskFile(root, resolveProjectPath(root.path, path));
    return disk.kind === "file" ? disk.body : null;
  };
}

/* The removals imported, directly or through one another, by a file that stays. */
function importedAmong(
  removing: ReadonlySet<string>,
  staying: readonly string[],
  textOf: (path: string) => string | null,
): Set<string> {
  const imported = new Set<string>();
  const queue = staying.filter((path) => !removing.has(path));
  for (let path = queue.pop(); path !== undefined; path = queue.pop()) {
    for (const target of relativeTargets(path, textOf(path))) {
      if (!removing.has(target) || imported.has(target)) continue;
      imported.add(target);
      queue.push(target);
    }
  }
  return imported;
}

/* Every file the relative imports of a text may name, as TypeScript resolves them. */
function relativeTargets(path: string, text: string | null): string[] {
  if (text === null) return [];
  return moduleSpecifiers(path, text)
    .filter((specifier) => specifier.startsWith("."))
    .flatMap((specifier) => {
      const base = posix.join(posix.dirname(path), specifier);
      const script = base.replace(/\.(m|c)?js$/, ".$1ts");
      return [base, script, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`];
    });
}
