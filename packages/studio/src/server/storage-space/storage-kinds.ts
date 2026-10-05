/** What Studio keeps, each of which the Storage settings size and clear on its own. */
export const STORAGE_KINDS = [
  "requests",
  "mockLogs",
  "playground",
  "sessions",
  "mockStores",
  "backups",
] as const;

/** One of what Studio keeps. */
export type StorageKind = (typeof STORAGE_KINDS)[number];

/**
 * Whether a value names one of what Studio keeps.
 *
 * @param value - The value, as a page sent it
 * @returns `true` for one of {@link STORAGE_KINDS}
 * @example
 * ```ts
 * isStorageKind("sessions"); // true
 * ```
 */
export function isStorageKind(value: unknown): value is StorageKind {
  return typeof value === "string" && (STORAGE_KINDS as readonly string[]).includes(value);
}
