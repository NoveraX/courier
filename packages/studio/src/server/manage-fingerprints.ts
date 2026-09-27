import type { ImportStateEntry } from "../apis/imports-state";
import { generateFingerprints } from "../apis/merge/fingerprint";

/**
 * The endpoint fingerprints of an import's files, by file and then by
 * endpoint name: as Studio recorded them, or, for a file it recorded none
 * for, as the file on disk holds them, taken for unedited.
 *
 * @param entry - What Studio recorded about the import, if anything
 * @param bodies - The import's files on disk, by path
 * @returns Fingerprints by file, then by endpoint name
 */
export function manageFingerprints(
  entry: ImportStateEntry | undefined,
  bodies: Record<string, string>,
): Record<string, Record<string, string>> {
  const byFile: Record<string, Record<string, string>> = {};
  for (const [path, body] of Object.entries(bodies)) {
    const recorded = entry?.files[path]?.endpoints;
    const fingerprints = recorded ?? generateFingerprints(body);
    if (Object.keys(fingerprints).length > 0) byFile[path] = { ...fingerprints };
  }
  return byFile;
}
