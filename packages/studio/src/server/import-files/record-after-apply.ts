import type { ImportStateEntry } from "../../apis/imports-state";
import { bodyHash } from "./body-hash";
import type { FilePlan } from "./file-plan-types";
import type { RecordedFile } from "./recorded-file";

/** What the imports state says of the spec an apply generated from. */
export interface AppliedSpec {
  specHash: string;
  digest?: ImportStateEntry["digest"];
}

/**
 * Work out an import's record once a plan is applied: every file written,
 * with the hash of its body and its endpoints as generated; the files the
 * plan removed, forgot or found not to be Studio's gone from it; files the
 * user chose to keep as they are, and those kept because a file staying
 * imports them, still recorded; files outside the
 * import's directory forgotten.
 *
 * @param previous - The import's record before the apply, if any
 * @param applied - The plan as applied, confirmations taken in
 * @param spec - The spec the files came from
 * @param now - The time of the apply, ISO
 * @returns The import's new record
 */
export function recordAfterApply(
  previous: ImportStateEntry | undefined,
  applied: FilePlan,
  spec: AppliedSpec,
  now: string,
): ImportStateEntry {
  const files = new Map<string, RecordedFile>(
    Object.entries(previous?.files ?? {}).filter(([path]) => path.startsWith(`${applied.dir}/`)),
  );
  for (const path of applied.forgotten) files.delete(path);
  for (const removal of applied.removals) files.delete(removal.path);
  for (const kept of applied.kept) {
    if (kept.reason !== "unconfirmed" && kept.reason !== "imported") files.delete(kept.path);
  }
  for (const write of applied.writes) {
    const endpoints = Object.keys(write.endpoints).length > 0 ? { endpoints: write.endpoints } : {};
    files.set(write.path, {
      sha256: bodyHash(write.body),
      ...(write.carriesEdits && { carriesEdits: true }),
      ...endpoints,
    });
  }
  return {
    specHash: spec.specHash,
    ...(spec.digest !== undefined && { digest: spec.digest }),
    fetchedAt: previous?.fetchedAt ?? now,
    lastSyncedAt: now,
    dir: applied.dir,
    files: Object.fromEntries(files),
  };
}
