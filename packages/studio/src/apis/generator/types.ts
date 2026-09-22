/**
 * Generator options and output types.
 */

import type { CourierImportBase } from "@noverax/courier/config";
import { toBindingName } from "../parser/naming-utils";

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

/** Normalized shape used internally by codegen — every option has a value. */
export interface ResolvedGenerateOptions {
  type: CourierImportBase["type"];
  sourceName: string;
  outputDir: string;
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

export const DEFAULT_OPTIONS: ResolvedGenerateOptions = {
  type: "openapi",
  sourceName: "api",
  outputDir: "src/api",
  validation: "zod",
  groupBy: "tag",
  generateTypes: true,
  generateSchemas: true,
  addAuthMiddleware: true,
  includeComments: true,
  generateClient: "direct",
  selectedEndpoints: null,
};

/**
 * Fill in every optional codegen field on a loose `GenerateOptions` with the
 * project default so downstream generators can treat them as required.
 */
export function applyImportDefaults(options: GenerateOptions): ResolvedGenerateOptions {
  return {
    type: options.type ?? DEFAULT_OPTIONS.type,
    /* Emitted as `export const <name>`, so it has to be one. */
    sourceName: toBindingName(options.sourceName ?? DEFAULT_OPTIONS.sourceName),
    outputDir: options.outputDir,
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
