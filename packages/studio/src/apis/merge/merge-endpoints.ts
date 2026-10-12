import { ownValue } from "../own-value";
import { normalizeCode } from "./hash";
import type { MergedEntry } from "./place-under-prefix";
import type {
  ExistingEndpointInfo,
  ExistingGroupInfo,
  FingerprintResult,
  MergeChange,
} from "./types";

/**
 * The endpoints of a merged file, in the spec's order, then the user's own.
 *
 * One nobody touched, or new, is taken from the spec; one the user edited,
 * or wrote comments into, is kept whole; one the spec no longer describes
 * goes when Studio wrote it, and stays when the user did. The comments the
 * user wrote above an endpoint stay with it whatever becomes of its code.
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

    if (existEp && (status === "modified" || commentedByHand(existEp, genEp))) {
      /* An endpoint is one declarative expression now, with no closure to
         graft a regenerated head onto. What the user wrote is what they meant,
         so it stays whole; the change list says the spec moved under it. A
         comment does not count as an edit, so it is checked for apart. */
      result.push({
        name,
        note: existEp.note,
        comment: existEp.comment ?? genEp.comment,
        code: existEp.code,
        kept: true,
      });
      changes.push({
        type: "preserved",
        target: `endpoint:${name}`,
        detail:
          status === "modified"
            ? "edited by hand; the spec changed under it"
            : keptFor(existEp, genEp),
      });
      continue;
    }

    const note = existEp?.note ?? genEp.note;
    result.push({ name, note, comment: genEp.comment, code: genEp.code, kept: false });
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

    const { note, comment, code } = existEp;
    result.push({ name: existEp.name, note, comment, code, kept: true });
    changes.push({
      type: "preserved",
      target: `endpoint:${existEp.name}`,
      detail: "user-added endpoint",
    });
  }

  return result;
}

/* Whether the user wrote comments into an endpoint: ones the spec's version of it lacks. */
function commentedByHand(existing: ExistingEndpointInfo, generated: ExistingEndpointInfo): boolean {
  const spec = new Set(generated.inlineComments ?? []);
  return (existing.inlineComments ?? []).some((comment) => !spec.has(comment));
}

/* What became of an endpoint kept for the comments in it: the same as the spec's, or not updated. */
function keptFor(existing: ExistingEndpointInfo, generated: ExistingEndpointInfo): string {
  return normalizeCode(existing.code) === normalizeCode(generated.code)
    ? "holds comments written by hand"
    : "holds comments written by hand, so the spec's change to it is not applied";
}
