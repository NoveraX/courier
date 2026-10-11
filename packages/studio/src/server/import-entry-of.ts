import type { CourierImportBase, CourierImportEntry } from "@noverax/courier/config";

import type { GenerateOptions, ParsedSpec } from "../apis";
import { DEFAULT_OPTIONS } from "../apis/generator/types";
import { specTypeOf } from "./spec-type-of";
import type { WriteBody } from "./write-types";

/**
 * The `imports` entry an import is declared with: where its specification
 * comes from, its type, its folder and name, and every option the write
 * changed from its default — so regenerating it, as an update does, writes
 * what this write wrote.
 *
 * @param body - The write: how the specification was given, and its address for a URL import
 * @param spec - The specification as Studio parsed it
 * @param options - The options the files were generated with
 * @returns The entry
 * @example
 * ```ts
 * importEntryOf(body, spec, { ...options, sourceName: "pets" });
 * // → { importType: "url", from: "https://specs.example/pets.json", type: "openapi", outputDir: "src/api", sourceName: "pets" }
 * ```
 */
export function importEntryOf(
  body: WriteBody,
  spec: ParsedSpec,
  options: GenerateOptions,
): CourierImportEntry {
  const base: CourierImportBase = {
    type: specTypeOf(spec),
    outputDir: options.outputDir,
    sourceName: options.sourceName,
    ...codegenChoices(options),
  };
  if (body.importType === "url") return { importType: "url", from: body.specUrl ?? "", ...base };
  return body.importType === "raw"
    ? { importType: "raw", ...base }
    : { importType: "file", ...base };
}

function codegenChoices(options: GenerateOptions): Partial<CourierImportBase> {
  return {
    validation: differs(options.validation, DEFAULT_OPTIONS.validation),
    groupBy: differs(options.groupBy, DEFAULT_OPTIONS.groupBy),
    generateTypes: differs(options.generateTypes, DEFAULT_OPTIONS.generateTypes),
    generateSchemas: differs(options.generateSchemas, DEFAULT_OPTIONS.generateSchemas),
    generateClient: differs(options.generateClient, DEFAULT_OPTIONS.generateClient),
    addAuthMiddleware: differs(options.addAuthMiddleware, DEFAULT_OPTIONS.addAuthMiddleware),
    includeComments: differs(options.includeComments, DEFAULT_OPTIONS.includeComments),
    include: options.include,
    exclude: options.exclude,
  };
}

function differs<TValue>(value: TValue | undefined, preset: TValue): TValue | undefined {
  return value === preset ? undefined : value;
}
