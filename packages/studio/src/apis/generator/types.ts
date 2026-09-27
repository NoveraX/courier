/**
 * Generator options and output types.
 */

import type { CourierImportBase } from "@noverax/courier/config";
import type { ImportLayout } from "../layout";

// ── Options ──────────────────────────────────────────────────────────────────

/**
 * Input shape accepted by `generateCode`. Mirrors the user-authored
 * `courier.config.ts` import declaration so codegen consumes the same object
 * written by the user. Codegen-required fields are optional here and filled in
 * by `applyImportDefaults` at the start of the pipeline.
 *
 * `selectedEndpoints` is transient UI state — never persisted to config.
 */
export type GenerateOptions = CourierImportBase & {
  selectedEndpoints?: Record<string, string[]> | null;
};

/**
 * The generation settings a helper reads. Both an import's declaration and
 * its resolved options satisfy it, so a helper that only reads settings
 * does not care which it is given.
 */
export type GeneratorSettings = Partial<
  Pick<
    CourierImportBase,
    | "type"
    | "validation"
    | "groupBy"
    | "generateTypes"
    | "generateSchemas"
    | "generateClient"
    | "addAuthMiddleware"
    | "includeComments"
  >
>;

/** Normalized shape used internally by codegen — every option has a value. */
export interface ResolvedGenerateOptions {
  type: CourierImportBase["type"];
  /** The binding the source is exported under, from the layout. */
  sourceName: string;
  /** Where every generated file goes. */
  layout: ImportLayout;
  validation: "zod" | "valibot" | "arktype" | "none";
  groupBy: "tag" | "path" | "single";
  generateTypes: boolean;
  generateSchemas: boolean;
  addAuthMiddleware: boolean;
  includeComments: boolean;
  generateClient: "direct" | "proxy" | "both" | "none";
  selectedEndpoints: Record<string, string[]> | null;
  include?: CourierImportBase["include"];
  exclude?: CourierImportBase["exclude"];
  transform?: CourierImportBase["transform"];
}

/** The generation settings an import declaration may leave out, and what they default to. */
export type GenerationDefaults = Omit<
  ResolvedGenerateOptions,
  "sourceName" | "layout" | "selectedEndpoints" | "include" | "exclude" | "transform"
>;

export const DEFAULT_OPTIONS: GenerationDefaults = {
  type: "openapi",
  validation: "zod",
  groupBy: "tag",
  generateTypes: true,
  generateSchemas: true,
  /* Off by default: it reads the environment, so the module it lands in
     belongs on a server, not in a browser bundle. */
  addAuthMiddleware: false,
  includeComments: true,
  generateClient: "direct",
};

/**
 * Fill in every optional codegen field on a loose `GenerateOptions` with the
 * project default so downstream generators can treat them as required.
 *
 * @param options - The declaration's options
 * @param layout - Where the import's files go, which also names its source binding
 * @returns Every option with a value
 */
export function applyImportDefaults(
  options: GenerateOptions,
  layout: ImportLayout,
): ResolvedGenerateOptions {
  return {
    type: options.type ?? DEFAULT_OPTIONS.type,
    sourceName: layout.sourceBinding,
    layout,
    validation: options.validation ?? DEFAULT_OPTIONS.validation,
    groupBy: options.groupBy ?? DEFAULT_OPTIONS.groupBy,
    generateTypes: options.generateTypes ?? DEFAULT_OPTIONS.generateTypes,
    generateSchemas: options.generateSchemas ?? DEFAULT_OPTIONS.generateSchemas,
    addAuthMiddleware: options.addAuthMiddleware ?? DEFAULT_OPTIONS.addAuthMiddleware,
    includeComments: options.includeComments ?? DEFAULT_OPTIONS.includeComments,
    generateClient: options.generateClient ?? DEFAULT_OPTIONS.generateClient,
    selectedEndpoints: options.selectedEndpoints ?? null,
    include: options.include,
    exclude: options.exclude,
    transform: options.transform,
  };
}

// ── Generated file ───────────────────────────────────────────────────────────

export interface GeneratedFile {
  /** Relative file path, e.g. "src/api/users.ts" */
  path: string;
  /** File content */
  content: string;
}
