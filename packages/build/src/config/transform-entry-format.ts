/**
 * How the first line of a transform cache entry is written.
 *
 * - `prefix`: how every entry starts, whatever the version of its format, so
 *   pruning can tell an entry from a file someone else put in the directory.
 * - `version`: the version this code writes; an entry in any other version
 *   is ignored and replaced.
 */
export const TRANSFORM_ENTRY_FORMAT = {
  prefix: "// courier-transform ",
  version: "2",
} as const;
