/**
 * A size as people say it: in megabytes from one up, in kilobytes below,
 * to a tenth.
 *
 * @param bytes - The size in bytes
 * @returns Its label
 * @example
 * ```ts
 * sizeLabel(65_536); // "64 KB"
 * sizeLabel(3_355_443); // "3.2 MB"
 * ```
 */
export function sizeLabel(bytes: number): string {
  return bytes >= 1_048_576
    ? `${Number((bytes / 1_048_576).toFixed(1))} MB`
    : `${Number((bytes / 1024).toFixed(1))} KB`;
}
