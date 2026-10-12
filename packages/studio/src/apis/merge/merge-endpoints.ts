import { ownValue } from "../own-value";
import type { MergedEntry } from "./place-under-prefix";
import type { ExistingGroupInfo, FingerprintResult, MergeChange } from "./types";

/**
 * The endpoints of a merged file, in the spec's order, then the user's own.
 *
 * One nobody touched, or new, is taken from the spec; one the user edited
 * is kept whole; one the spec no longer describes goes when Studio wrote it,
 * and stays when the user did.
 *
 * @param existing - The file on disk
 * @param generated - The file the import generated
 * @param fingerprints - How each endpoint of the file compares with what Studio wrote
 * @param changes - Where what became of each endpoint is noted
 * @returns The endpoints, each marked kept when its code is the user's
 * @example
 * ```ts
 * mergeEndpoints(parseExistingGroup(onDisk), parseExistingGroup(fresh), fingerprints, changes);
 * ```
 */
export function mergeEndpoints(
  existing: ExistingGroupInfo,
  generated: ExistingGroupInfo,
  fingerprints: FingerprintResult,
  changes: MergeChange[],
): MergedEntry[] {
  const result: MergedEntry[] = [];
  const existingByName = new Map(existing.endpoints.map((e) => [e.name, e]));
  const generatedNames = new Set(generated.endpoints.map((e) => e.name));

  for (const genEp of generated.endpoints) {
    const { name } = genEp;
    const status = ownValue(fingerprints.endpoints, name);
    const existEp = existingByName.get(name);

    if (existEp && status === "modified") {
      /* An endpoint is one declarative expression now, with no closure to
         graft a regenerated head onto. What the user wrote is what they meant,
         so it stays whole; the change list says the spec moved under it. */
      result.push({
        name,
        comment: existEp.comment ?? genEp.comment,
        code: existEp.code,
        kept: true,
      });
      changes.push({
        type: "preserved",
        target: `endpoint:${name}`,
        detail: "edited by hand; the spec changed under it",
      });
      continue;
    }

    result.push({ name, comment: genEp.comment, code: genEp.code, kept: false });
    const changeType = status === "new" || !existEp ? "added" : "updated";
    changes.push({ type: changeType, target: `endpoint:${name}`, detail: "from spec" });
  }

  /* Keep what the user wrote, drop what the spec dropped. An endpoint we
     generated before and the spec no longer describes is removed; one we never
     generated is the user's own and stays. */
  for (const existEp of existing.endpoints) {
    if (generatedNames.has(existEp.name)) continue;

    if (ownValue(fingerprints.endpoints, existEp.name) === "removed") {
      changes.push({
        type: "removed",
        target: `endpoint:${existEp.name}`,
        detail: "no longer in spec",
      });
      continue;
    }

    result.push({ name: existEp.name, comment: existEp.comment, code: existEp.code, kept: true });
    changes.push({
      type: "preserved",
      target: `endpoint:${existEp.name}`,
      detail: "user-added endpoint",
    });
  }

  return result;
}
