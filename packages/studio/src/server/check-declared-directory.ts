import type { CourierImportEntry } from "@noverax/courier/config";
import type { GenerateOptions } from "../apis";
import { resolveImportLayout } from "../apis/layout";
import { DeclarationMismatchError } from "./declaration-mismatch-error";

/**
 * Refuse options that put a declared import somewhere other than its
 * declaration, before anything is written. The directories must be spelled
 * alike, letter case included: on a case-insensitive disk `src/Api` and
 * `src/api` are one directory, but paths that differ in case do not compare
 * equal, so files would be recorded under a spelling the declaration does
 * not use. Options Studio refuses to lay out are refused here too.
 *
 * @param name - The import's key
 * @param entry - Its declaration, when courier.config has one
 * @param options - The options the request generates with
 * @throws {InvalidImportError} When the options' directory or source name is refused
 * @throws {DeclarationMismatchError} When the declaration puts the import elsewhere
 */
export function checkDeclaredDirectory(
  name: string,
  entry: CourierImportEntry | undefined,
  options: GenerateOptions,
): void {
  const requested = resolveImportLayout(options, name).dir;
  if (!entry) return;
  const declared = resolveImportLayout(entry, name).dir;
  if (declared !== requested) throw new DeclarationMismatchError(name, declared, requested);
}
