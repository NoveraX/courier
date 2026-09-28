import type { CourierImportEntry } from "@noverax/courier/config";
import { computeSpecHash, type ParsedSpec } from "../apis";
import { filterSpec } from "../apis/filter-spec";
import { ImportTransformError } from "./import-transform-error";
import { messageOf } from "./message-of";
import { isParsedSpec } from "./parsed-spec-guard";
import { SpecPinMismatchError } from "./spec-pin-mismatch-error";

/**
 * Refuse a specification other than the one a URL import's `pinHash` names.
 * The hash is the one Studio records for the import in
 * `.courier/imports-state.json`, of the specification as parsed.
 *
 * @param name - The import's key under `imports`
 * @param entry - Its declaration
 * @param spec - The specification as parsed, before any transform
 * @throws {SpecPinMismatchError} When the import pins another hash
 * @example
 * ```ts
 * checkPinnedHash("petstore", entry, parseSpec(raw));
 * ```
 */
export function checkPinnedHash(name: string, entry: CourierImportEntry, spec: ParsedSpec): void {
  if (entry.importType !== "url" || entry.pinHash === undefined) return;
  const actual = computeSpecHash(spec);
  if (actual !== entry.pinHash) throw new SpecPinMismatchError(name, entry.pinHash, actual);
}

/* What the import's transform makes of a copy of the spec; one that changes the copy in place may return nothing. */
async function transformed(
  name: string,
  transform: NonNullable<CourierImportEntry["transform"]>,
  spec: ParsedSpec,
): Promise<ParsedSpec> {
  const copy = structuredClone(spec);
  let result: unknown;
  try {
    result = await transform(copy);
  } catch (error) {
    throw new ImportTransformError(name, `threw: ${messageOf(error)}`, error);
  }
  const next = result === undefined ? copy : result;
  if (!isParsedSpec(next))
    throw new ImportTransformError(name, "returned something that is not a specification");
  return next;
}

/**
 * The specification a declared import is generated from: the one pinned,
 * as the import's `transform` makes it, with only the endpoints its
 * `include` and `exclude` keep. Every change to a declared import's files —
 * an update, managing its endpoints, writing it again — starts from here.
 *
 * @param name - The import's key under `imports`
 * @param entry - Its declaration
 * @param spec - The specification as parsed
 * @returns The specification to generate from
 * @throws {SpecPinMismatchError} When the import pins another hash
 * @throws {ImportTransformError} When the transform throws or returns no specification
 * @example
 * ```ts
 * const spec = await specAsDeclared("petstore", entry, body.newSpec);
 * ```
 */
export async function specAsDeclared(
  name: string,
  entry: CourierImportEntry,
  spec: ParsedSpec,
): Promise<ParsedSpec> {
  checkPinnedHash(name, entry, spec);
  const shaped =
    entry.transform === undefined ? spec : await transformed(name, entry.transform, spec);
  return filterSpec(shaped, entry.include, entry.exclude);
}

/** A specification to generate an import from, and the hash an update check compares. */
export interface DeclaredSpec {
  /** The specification as the import's declaration makes it; as sent while the import is undeclared. */
  spec: ParsedSpec;
  /** The hash of the specification as sent, before any transform or selection. */
  specHash: string;
}

/**
 * The specification a request sends for an import, made into the one its
 * declaration generates from, when courier.config declares it.
 *
 * @param entry - The import's declaration, if courier.config has one
 * @param name - The import's key under `imports`
 * @param spec - The specification as the request sends it
 * @returns The specification to generate from, and the hash to record
 * @throws {SpecPinMismatchError} When the import pins another hash
 * @throws {ImportTransformError} When the transform throws or returns no specification
 * @example
 * ```ts
 * const { spec, specHash } = await declaredSpec(getImportEntry(imports, name), name, body.newSpec);
 * ```
 */
export async function declaredSpec(
  entry: CourierImportEntry | undefined,
  name: string,
  spec: ParsedSpec,
): Promise<DeclaredSpec> {
  const specHash = computeSpecHash(spec);
  return { spec: entry === undefined ? spec : await specAsDeclared(name, entry, spec), specHash };
}
