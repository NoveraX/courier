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
  /**
   * The extension the generated files' relative imports carry: `.js` in a
   * project whose ES modules TypeScript resolves as Node does, where an
   * import without one does not compile. Decided by where the files go,
   * never persisted to config.
   */
  importExtension?: ".js";
  /**
   * The project's routes module, by its path from the project root, which
   * the proxy caller takes its routes from: where courier.config's
   * `studio.routes` puts it, `courier.routes.ts` by default. Decided by the
   * config, never persisted to the import's declaration.
   */
  routesModule?: string;
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
  /** The extension relative imports carry; empty for none. */
  importExtension: "" | ".js";
  /** The routes module, by its path from the project root. */
  routesModule: string;
  include?: CourierImportBase["include"];
  exclude?: CourierImportBase["exclude"];
  transform?: CourierImportBase["transform"];
}

/** The generation settings an import declaration may leave out, and what they default to. */
export type GenerationDefaults = Omit<
  ResolvedGenerateOptions,
  | "sourceName"
  | "layout"
  | "selectedEndpoints"
  | "importExtension"
  | "routesModule"
  | "include"
  | "exclude"
  | "transform"
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
    importExtension: options.importExtension ?? "",
    routesModule: options.routesModule ?? "courier.routes.ts",
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
