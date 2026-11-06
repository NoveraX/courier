import type { PackageNeed } from "./migration";
import type { CourierPackage, PackageField } from "./project-packages";
import type { Workspace } from "./workspace";

/** The packages to add, by manifest: by field, each name and its range. */
export type Additions = ReadonlyMap<
  string,
  ReadonlyMap<PackageField, Readonly<Record<string, string>>>
>;

/* The manifest of the workspace's package a file is in: the deepest package's folder above it. */
function manifestFor(workspace: Workspace, path: string): string {
  const dir = [...workspace.packages]
    .filter((each) => each === "" || path.startsWith(`${each}/`))
    .sort((a, b) => b.length - a.length)[0];
  return dir === undefined || dir === "" ? "package.json" : `${dir}/package.json`;
}

/**
 * The packages the migrated code needs that its manifests do not list:
 * each added to the manifest of the package its file is in, in the field
 * that lists the package it goes beside — a dev dependency where that
 * one is listed nowhere — at the target's caret range.
 *
 * @param workspace - The workspace
 * @param packages - Courier's packages its manifests list
 * @param needs - What each changed file needs
 * @param target - The target's version
 * @returns The packages to add
 * @example
 * ```ts
 * additionsOf(workspace, packages, [{ path: "scripts/check.ts", need }], "0.5.0"); // Map { "package.json" => Map { "devDependencies" => { "@noverax/courier-build": "^0.5.0" } } }
 * ```
 */
export function additionsOf(
  workspace: Workspace,
  packages: readonly CourierPackage[],
  needs: ReadonlyArray<{ readonly path: string; readonly need: PackageNeed }>,
  target: string,
): Additions {
  const additions = new Map<string, Map<PackageField, Record<string, string>>>();
  for (const { path, need } of needs) {
    const manifest = manifestFor(workspace, path);
    const listed = packages.filter((each) => each.manifest === manifest);
    if (listed.some((each) => each.name === need.name)) continue;
    const field = listed.find((each) => each.name === need.beside)?.field ?? "devDependencies";
    const fields = additions.get(manifest) ?? new Map<PackageField, Record<string, string>>();
    fields.set(field, { ...fields.get(field), [need.name]: `^${target}` });
    additions.set(manifest, fields);
  }
  return additions;
}
