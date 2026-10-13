import type { CourierImportEntry } from "@noverax/courier/config";
import { SpecPinMismatchError } from "./spec-pin-mismatch-error";

/**
 * Refuse a specification other than the one a URL import's `pinHash`
 * names, by the hash an update check read of it — the hash Studio records
 * for the import, of the specification as parsed.
 *
 * @param name - The import's key under `imports`
 * @param entry - Its declaration
 * @param hash - The hash of the specification at hand
 * @throws {SpecPinMismatchError} When the import pins another hash
 * @example
 * ```ts
 * checkPinnedSpecHash("petstore", entry, (await readFetchedSpec(entry.from, raw)).hash);
 * ```
 */
export function checkPinnedSpecHash(name: string, entry: CourierImportEntry, hash: string): void {
  if (entry.importType !== "url" || entry.pinHash === undefined) return;
  if (hash !== entry.pinHash) throw new SpecPinMismatchError(name, entry.pinHash, hash);
}
