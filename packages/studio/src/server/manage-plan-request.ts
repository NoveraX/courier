import type { ImportStateEntry } from "../apis/imports-state";
import type { ImportLayout } from "../apis/layout";
import type { AddResult, RemoveResult } from "../apis/manage/types";
import type { PlanRequest, PlanTarget } from "./import-files/file-plan-types";
import { ManagePlanConflictError } from "./manage-plan-conflict-error";

/**
 * Ask for the files adding and removing endpoints produce. Each file is
 * computed from its version on disk, so it is written as computed; the
 * files of a group removed whole are no longer wanted. A file both steps
 * change is written as the removal computed it, on top of the addition;
 * the addition changes each file once.
 * Endpoint fingerprints stay as recorded, with the added endpoints' taken
 * from the generated file and the removed endpoints' dropped.
 *
 * @param layout - Where the import's files are
 * @param toRemove - The endpoints removed, by group
 * @param added - What adding endpoints produced, if anything
 * @param removed - What removing endpoints produced, on top of the addition, if anything
 * @param entry - What Studio recorded about the import, if anything
 * @param fileOf - The file a group's endpoints are in
 * @returns The request
 * @throws {ManagePlanConflictError} When the addition computed one file twice
 */
export function managePlanRequest(
  layout: ImportLayout,
  toRemove: Record<string, string[]>,
  added: AddResult | undefined,
  removed: RemoveResult | undefined,
  entry: ImportStateEntry | undefined,
  fileOf: (group: string) => string,
): PlanRequest {
  const endpoints = new Map<string, Record<string, string>>();
  const recorded = (path: string) => endpoints.get(path) ?? entry?.files[path]?.endpoints ?? {};
  const targets = new Map<string, PlanTarget>();
  const want = (path: string, body: string, fingerprints: Record<string, string>) => {
    endpoints.set(path, fingerprints);
    targets.set(path, { path, body, kind: "derived", endpoints: fingerprints });
  };
  for (const change of added?.files ?? []) {
    if (targets.has(change.path)) throw new ManagePlanConflictError(change.path);
    want(change.path, change.content, { ...recorded(change.path), ...change.generatedEndpoints });
  }
  for (const change of removed?.modifiedFiles ?? []) {
    want(
      change.path,
      change.content,
      withoutRemoved(recorded(change.path), change.path, toRemove, fileOf),
    );
  }
  if (removed?.indexFileUpdate) {
    const { path, content } = removed.indexFileUpdate;
    want(path, content, recorded(path));
  }
  const removals = (removed?.deletedFiles ?? []).filter((path) => !targets.has(path));
  return {
    importName: layout.importName,
    dir: layout.dir,
    targets: [...targets.values()],
    removals,
  };
}

function withoutRemoved(
  fingerprints: Record<string, string>,
  path: string,
  toRemove: Record<string, string[]>,
  fileOf: (group: string) => string,
): Record<string, string> {
  const gone = new Set(
    Object.entries(toRemove).flatMap(([group, names]) => (fileOf(group) === path ? names : [])),
  );
  return Object.fromEntries(Object.entries(fingerprints).filter(([name]) => !gone.has(name)));
}
