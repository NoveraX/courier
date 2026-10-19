import { formatList } from "@/lib/formatters";

import { KEPT_LABEL } from "./file-plan-labels";
import type { FilePlanSummary } from "./types-file-plan";

/** A file of a plan as a section lists it: its path, and the note beside it. */
export interface PlanFileRow {
  path: string;
  note: string;
}

/**
 * The files a plan removes and those it leaves as they are, as the steps
 * the user has allowed so far make them: a file kept only because a file a
 * pending step would remove or rewrite imports it goes, as the apply then
 * removes it, once every such step is allowed, and says so while it waits.
 *
 * @param plan - The plan
 * @param confirmed - The pending steps the user has allowed
 * @returns The rows of the removed files and of those left as they are
 * @example
 * ```ts
 * planFileRows(plan, ["src/api/shop/store/index.ts"]).removed;
 * // → [{ path: "src/api/shop/store/schemas.ts", note: "removed with store/index.ts" }]
 * ```
 */
export function planFileRows(
  plan: FilePlanSummary,
  confirmed: readonly string[],
): { removed: PlanFileRow[]; kept: PlanFileRow[] } {
  const removed = plan.removals.map(({ path }) => ({ path, note: "removed" }));
  const kept: PlanFileRow[] = [];
  for (const { path, reason, unless } of plan.kept) {
    if (unless === undefined) kept.push({ path, note: KEPT_LABEL[reason] });
    else if (unless.every((step) => confirmed.includes(step)))
      removed.push({
        path,
        note: `removed with ${formatList(unless.map((step) => within(plan, step)))}`,
      });
    else
      kept.push({
        path,
        note: `kept unless you allow ${formatList(unless.map((step) => stepPhrase(plan, step)))}`,
      });
  }
  return { removed, kept };
}

/* A pending step as the note names it: what it does to its file. */
function stepPhrase(plan: FilePlanSummary, path: string): string {
  const kind = plan.pending.find((step) => step.path === path)?.kind;
  return `${kind === "replace" ? "replacing" : "removing"} ${within(plan, path)}`;
}

/* A path as the import's folder names it, where it is inside that folder. */
function within(plan: FilePlanSummary, path: string): string {
  const prefix = `${plan.dir}/`;
  return plan.dir !== "" && path.startsWith(prefix) ? path.slice(prefix.length) : path;
}
