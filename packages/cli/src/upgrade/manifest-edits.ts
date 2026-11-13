import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  type PlannedEdit,
  type UpgradeView,
  withJsonStrings,
} from "@noverax/create-courier/engine";

import type { CourierPackage } from "./project-packages";
import { bumpRange } from "./range-bump";
import { formatVersion, type Version } from "./versions";

/** The changes an upgrade makes to the workspace's manifests, and each package as its plan shows it. */
export interface ManifestEdits {
  readonly edits: readonly PlannedEdit[];
  readonly packages: UpgradeView["packages"];
}

/* A manifest's text with the ranges given set where it writes them, field by field; `undefined` where it is no JSON object the edit reads. */
function withRanges(
  text: string,
  ranges: ReadonlyMap<string, Readonly<Record<string, string>>>,
): string | undefined {
  let after: string | undefined = text;
  for (const [field, values] of ranges)
    after = after === undefined ? undefined : withJsonStrings(after, field, values);
  return after;
}

/**
 * The ranges an upgrade writes in each manifest of the workspace: every
 * one of Courier's packages raised to the target, in the same kind of
 * range, where it is written and nowhere else — the rest of each file is
 * left as it is. A range of another kind is left as written, and the
 * plan says why; one at the target already is not shown.
 *
 * @param root - The workspace's folder
 * @param packages - Courier's packages, as its manifests list them
 * @param target - The release to move to
 * @returns The manifests' changes, and the packages as the plan shows them
 * @example
 * ```ts
 * manifestEdits("/work/shop", courierPackages(workspace), parseVersion("0.5.0")!).edits.map((edit) => edit.path); // ["package.json"]
 * ```
 */
export function manifestEdits(
  root: string,
  packages: readonly CourierPackage[],
  target: Version,
): ManifestEdits {
  const shown: Array<UpgradeView["packages"][number]> = [];
  const edits: PlannedEdit[] = [];
  for (const manifest of new Set(packages.map((each) => each.manifest))) {
    const ranges = new Map<string, Record<string, string>>();
    for (const each of packages.filter((listed) => listed.manifest === manifest)) {
      const bump = bumpRange(each.range, target);
      const base = { manifest, name: each.name, field: each.field, from: each.range };
      if ("why" in bump) shown.push({ ...base, to: undefined, why: bump.why });
      else if (bump.to !== each.range) {
        shown.push({ ...base, to: bump.to });
        ranges.set(each.field, { ...ranges.get(each.field), [each.name]: bump.to });
      }
    }
    if (ranges.size === 0) continue;
    const before = readFileSync(join(root, manifest), "utf8");
    const after = withRanges(before, ranges);
    if (after === undefined || after === before) continue;
    edits.push({
      path: manifest,
      purpose: `moves Courier's packages to ${formatVersion(target)}`,
      state: "edit",
      before,
      after,
      change: (text) => (text === before ? after : undefined),
    });
  }
  return { edits, packages: shown };
}
