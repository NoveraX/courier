import type { CourierImportEntry } from "@noverax/courier/config";
import { DEFAULT_OPTIONS, type GenerateOptions } from "../apis";
import type { GeneratorSettings } from "../apis/generator/types";
import { resolveImportLayout } from "../apis/layout";
import { type DeclarationDifference, DeclarationMismatchError } from "./declaration-mismatch-error";

/* The options that shape the generated files, besides where they go. */
const SHAPING = [
  "type",
  "validation",
  "groupBy",
  "generateTypes",
  "generateSchemas",
  "generateClient",
  "addAuthMiddleware",
  "includeComments",
] as const satisfies ReadonlyArray<keyof GeneratorSettings>;

/**
 * Refuse options that put a declared import somewhere other than its
 * declaration, or generate it otherwise, before anything is written. The
 * directories must be spelled alike, letter case included: on a
 * case-insensitive disk `src/Api` and `src/api` are one directory, but
 * paths that differ in case do not compare equal, so files would be
 * recorded under a spelling the declaration does not use. Every other
 * option is compared with its default filled in, since an update and a
 * change to endpoints generate as declared. Options Studio refuses to lay
 * out are refused here too.
 *
 * @param name - The import's key
 * @param entry - Its declaration, when courier.config has one
 * @param options - The options the request generates with
 * @throws {InvalidImportError} When the options' directory or source name is refused
 * @throws {DeclarationMismatchError} When the declaration puts the import elsewhere or generates it otherwise
 * @example
 * ```ts
 * checkDeclaredDirectory("pets", getImportEntry(imports, "pets"), body.options);
 * ```
 */
export function checkDeclaredDirectory(
  name: string,
  entry: CourierImportEntry | undefined,
  options: GenerateOptions,
): void {
  const requested = resolveImportLayout(options, name).dir;
  if (!entry) return;
  const declared = resolveImportLayout(entry, name).dir;
  const differences: DeclarationDifference[] =
    declared === requested ? [] : [{ option: "folder", declared, requested }];
  for (const option of SHAPING) {
    const want = String(entry[option] ?? DEFAULT_OPTIONS[option]);
    const got = String(options[option] ?? DEFAULT_OPTIONS[option]);
    if (want !== got) differences.push({ option, declared: want, requested: got });
  }
  if (differences.length > 0) throw new DeclarationMismatchError(name, differences);
}
