import type { ImportStateEntry } from "../apis/imports-state";
import { generateFingerprints } from "../apis/merge/fingerprint";

/**
 * The endpoint fingerprints of an import as the inventory and removal
 * warnings read them, by endpoint name: as Studio recorded them, or, where
 * it recorded none, as the files on disk hold them, taken for unedited.
 *
 * @param entry - What Studio recorded about the import, if anything
 * @param bodies - The import's files on disk, by path
 * @returns Fingerprints by endpoint name
 */
export function manageFingerprints(
  entry: ImportStateEntry | undefined,
  bodies: Record<string, string>,
): Record<string, string> {
  const recorded = Object.values(entry?.files ?? {}).flatMap((file) =>
    Object.entries(file.endpoints ?? {}),
  );
  if (recorded.length > 0) return Object.fromEntries(recorded);
  return Object.fromEntries(
    Object.values(bodies).flatMap((body) => Object.entries(generateFingerprints(body))),
  );
}
