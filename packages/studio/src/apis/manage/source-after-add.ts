import type { GenerateOptions } from "../generator/types";
import type { ImportLayout } from "../layout";
import { appendEndpointsToGroup } from "./append-to-group";
import { withEndpointsObject } from "./endpoints-object";
import { sourceWithNewGroups } from "./source-with-new-groups";

/** What an addition brings to an import's source. */
export interface SourceAddition {
  /** The source generated for the endpoints being added. */
  generated: string;
  /** The API's own endpoints added, which the source holds itself. */
  endpoints: readonly string[];
  /** The groups added that sit in no other group, which the source lists. */
  groups: readonly string[];
}

/**
 * The import's source once endpoints are added, in one change: the API's
 * own endpoints appended to its `endpoints` — the object added first to a
 * source that lists only groups — and the new groups listed. Changed in two
 * steps from the file on disk, the second change would have dropped the
 * first.
 *
 * @param addition - The generated source, and the endpoints and groups it adds
 * @param options - The import's generation options, of which `groupBy` is read
 * @param existingFiles - The import's files as they are, by path
 * @param layout - Where the import's files are
 * @returns The source, or `undefined` when there is none or nothing changes
 * @throws {UnrecognizedFileError} When the source does not parse, or declares no API
 * @example
 * ```ts
 * sourceAfterAdd({ generated, endpoints: ["health"], groups: ["store"] }, options, files, layout);
 * ```
 */
export function sourceAfterAdd(
  addition: SourceAddition,
  options: Pick<GenerateOptions, "groupBy">,
  existingFiles: Record<string, string>,
  layout: ImportLayout,
): string | undefined {
  const existing = existingFiles[layout.sourceFile];
  if (existing === undefined) return undefined;
  const path = layout.sourceFile;
  const withEndpoints =
    addition.endpoints.length === 0
      ? existing
      : appendEndpointsToGroup(path, withEndpointsObject(path, existing), addition.generated, [
          ...addition.endpoints,
        ]);
  const files = { ...existingFiles, [path]: withEndpoints };
  const grouped = sourceWithNewGroups(addition.groups, options, files, layout);
  const content = grouped?.content ?? withEndpoints;
  return content === existing ? undefined : content;
}
