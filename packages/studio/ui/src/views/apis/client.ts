/**
 * HTTP client for Studio APIs server endpoints.
 * All requests go through the Vite dev server proxy → Express backend.
 */

import { post } from "@/lib/api-client";
import type {
  EndpointInventory,
  GeneratedFile,
  GenerateOptions,
  ParsedSpec,
  SpecDiff,
} from "./types";

// ── Parse ───────────────────────────────────────────────────────────────────

export function parseSpecFromUrl(url: string): Promise<ParsedSpec> {
  return post("/api/apis/parse", { source: "url", content: url });
}

export function parseSpecFromRaw(content: string): Promise<ParsedSpec> {
  return post("/api/apis/parse", { source: "raw", content });
}

export function parseSpecFromFile(filePath: string): Promise<ParsedSpec> {
  return post("/api/apis/parse", { source: "file", content: filePath });
}

// ── Generate ────────────────────────────────────────────────────────────────

export function generateCode(
  spec: ParsedSpec,
  options: GenerateOptions,
): Promise<{ files: GeneratedFile[] }> {
  return post("/api/apis/generate", { spec, options });
}

/** Where Studio would write an import's files. */
export interface ImportLayoutPreview {
  dir: string;
  sourceFile: string;
  sourceBinding: string;
}

/**
 * Ask Studio where an import's files would go. The wizard names the import
 * after its source, so both are the source name.
 *
 * @param outputDir - The output directory as typed
 * @param sourceName - The source name as typed
 * @returns The import's directory, its source file and the binding it exports
 * @throws Error with Studio's reason when it refuses the directory or the name
 * @example
 * ```ts
 * const { dir } = await previewLayout("src/api", "petStore"); // "src/api/pet-store"
 * ```
 */
export function previewLayout(outputDir: string, sourceName: string): Promise<ImportLayoutPreview> {
  return post("/api/apis/layout", { outputDir, sourceName, importName: sourceName });
}

// ── Imports ─────────────────────────────────────────────────────────────────

export function checkSourceUpdates(
  name: string,
): Promise<{ changed: boolean; newSpec?: ParsedSpec }> {
  return post("/api/apis/imports/check-updates", { name });
}

export function checkAllUpdates(): Promise<{
  /** By import: whether it changed; why the check failed; or why it cannot be checked. */
  results: Record<string, { changed: boolean; error?: string; unchecked?: string }>;
}> {
  return post("/api/apis/imports/check-all");
}

// ── Diff ────────────────────────────────────────────────────────────────────

export function diffSpecs(oldSpec: ParsedSpec, newSpec: ParsedSpec): Promise<SpecDiff> {
  return post("/api/apis/diff", { oldSpec, newSpec });
}

// ── Manage ───────────────────────────────────────────────────────────────────

export function fetchInventory(name: string, spec: ParsedSpec): Promise<EndpointInventory> {
  return post("/api/apis/manage/inventory", { name, newSpec: spec });
}
