import { pathSegments, rebaseEntryPath } from "../manage/rebase-entry-path";

/** An endpoint in a merged group, and whether its code is the user's, from the file on disk. */
export interface MergedEntry {
  /** The key it is declared under. */
  name: string;
  /** The comments the user wrote above it, which a merge keeps whatever becomes of its code. */
  note?: string | undefined;
  comment?: string | undefined;
  code: string;
  kept: boolean;
}

/**
 * Choose the prefix a merged group declares, and write each endpoint's path
 * under it, so every endpoint calls the URL it called — the user's, under
 * the prefix the file had — or the one the specification now gives it: the
 * generated prefix when every endpoint the user kept fits under it,
 * otherwise the part both prefixes share, and otherwise the file's own
 * prefix, which leaves the user's paths as they are.
 *
 * @param entries - The merged endpoints, their code naming one of the builders `bases`
 * @param bases - The names the file calls its builders by: `endpoint`, `stream`
 * @param filePrefix - The prefix the file on disk declares, or `null` when Studio cannot read it
 * @param generatedPrefix - The prefix the specification gives the group
 * @returns The prefix, and the endpoints with their paths under it; `null`
 *   when no prefix keeps every endpoint's URL
 * @example
 * ```ts
 * placeUnderPrefix(entries, ["endpoint"], "/v1/customers", "/v1").prefix; // "/v1"
 * ```
 */
export function placeUnderPrefix(
  entries: readonly MergedEntry[],
  bases: readonly string[],
  filePrefix: string | null,
  generatedPrefix: string,
): { prefix: string; entries: MergedEntry[] } | null {
  const same = (a: string, b: string): boolean =>
    pathSegments(a).join("/") === pathSegments(b).join("/");
  if (filePrefix === null || same(filePrefix, generatedPrefix) || !entries.some((e) => e.kept))
    return { prefix: generatedPrefix, entries: [...entries] };
  const under = (prefix: string): MergedEntry[] | null => {
    const placed: MergedEntry[] = [];
    for (const entry of entries) {
      const from = entry.kept ? filePrefix : generatedPrefix;
      const code = same(from, prefix)
        ? entry.code
        : rebaseEntryPath(entry.code, bases, from, prefix);
      if (code === null) return null;
      placed.push({ ...entry, code });
    }
    return placed;
  };
  const shared = sharedPrefix(filePrefix, generatedPrefix);
  for (const prefix of [generatedPrefix, shared, filePrefix]) {
    const placed = under(prefix);
    if (placed !== null) return { prefix, entries: placed };
  }
  return null;
}

function sharedPrefix(a: string, b: string): string {
  const left = pathSegments(a);
  const right = pathSegments(b);
  const shared: string[] = [];
  for (const [at, segment] of left.entries()) {
    if (right[at] !== segment) break;
    shared.push(segment);
  }
  return `/${shared.join("/")}`;
}
