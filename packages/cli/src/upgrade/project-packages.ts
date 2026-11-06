import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { installedVersion, manifestOf } from "@noverax/create-courier/engine";

import type { Workspace } from "./workspace";

/** The fields of a package.json that list packages, in the order an upgrade reads them. */
export const PACKAGE_FIELDS = [
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "optionalDependencies",
] as const;

/** A field of a package.json that lists packages. */
export type PackageField = (typeof PACKAGE_FIELDS)[number];

/** One of Courier's packages as a manifest of the workspace lists it. */
export interface CourierPackage {
  /** The manifest, relative to the workspace's root: `package.json`, `apps/web/package.json`. */
  readonly manifest: string;
  readonly name: string;
  readonly field: PackageField;
  /** Its range, as written. */
  readonly range: string;
  /** The version installed where the manifest's package resolves it, if any is. */
  readonly installed: string | undefined;
}

/* Courier's packages are its scope's: @noverax/courier, its adapters and tools. */
const SCOPE = "@noverax/";

/**
 * Courier's packages each manifest of a workspace lists, in each of its
 * four fields, with the version installed for it — read where the
 * manifest's package resolves it, so a workspace's hoisted install is
 * found.
 *
 * @param workspace - The workspace
 * @returns The packages, manifest by manifest
 * @throws {Error} When a manifest is not one JSON object
 * @example
 * ```ts
 * courierPackages(workspaceOf("/work/shop")); // [{ manifest: "package.json", name: "@noverax/courier", field: "dependencies", range: "^0.4.0", installed: "0.4.0" }]
 * ```
 */
export function courierPackages(workspace: Workspace): CourierPackage[] {
  return workspace.packages.flatMap((dir) => {
    const manifest = dir === "" ? "package.json" : `${dir}/package.json`;
    const path = join(workspace.root, manifest);
    if (!existsSync(path)) return [];
    const read = manifestOf(readFileSync(path, "utf8"), path);
    return PACKAGE_FIELDS.flatMap((field) =>
      Object.entries(read[field])
        .filter(([name]) => name.startsWith(SCOPE))
        .map(([name, range]) => ({
          manifest,
          name,
          field,
          range,
          installed: installedVersion(join(workspace.root, dir), name),
        })),
    );
  });
}
