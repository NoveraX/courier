/**
 * HTTP client for Studio APIs server endpoints.
 * All requests go through the Vite dev server proxy → Express backend.
 */

import type {
  EndpointInventory,
  GenerateOptions,
  GeneratedFile,
  ManagePreviewResult,
  ParsedSpec,
  SpecDiff,
} from "./types";
import { post } from "@/lib/api-client";

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

// ── Write ───────────────────────────────────────────────────────────────────

export function writeFiles(payload: {
  sourceName: string;
  spec: ParsedSpec;
  specUrl: string;
  importType: string;
  options: GenerateOptions;
  files: GeneratedFile[];
}): Promise<unknown> {
  return post("/api/apis/write", payload);
}

// ── Imports ─────────────────────────────────────────────────────────────────

export function removeRegistrySource(name: string): Promise<{ success: boolean }> {
  return post("/api/apis/imports/remove", { name });
}

export function checkSourceUpdates(
  name: string,
): Promise<{ changed: boolean; newSpec?: ParsedSpec }> {
  return post("/api/apis/imports/check-updates", { name });
}

export function checkAllUpdates(): Promise<{
  results: Record<string, { changed: boolean; error?: string }>;
}> {
  return post("/api/apis/imports/check-all");
}

// ── Diff ────────────────────────────────────────────────────────────────────

export function diffSpecs(
  oldSpec: ParsedSpec,
  newSpec: ParsedSpec,
): Promise<SpecDiff> {
  return post("/api/apis/diff", { oldSpec, newSpec });
}

// ── Update ──────────────────────────────────────────────────────────────────

export function previewUpdate(payload: {
  name: string;
  newSpec: ParsedSpec;
}): Promise<{
  files: Array<{ path: string; content: string; status: string; changes: unknown[] }>;
  breakingChanges: unknown[];
  specDiff?: SpecDiff;
}> {
  return post("/api/apis/update/preview", payload);
}

export function applyUpdate(payload: {
  name: string;
  newSpec: ParsedSpec;
}): Promise<{ success: boolean }> {
  return post("/api/apis/update/apply", payload);
}

// ── Manage ───────────────────────────────────────────────────────────────────

export function fetchInventory(
  name: string,
  spec: ParsedSpec,
): Promise<EndpointInventory> {
  return post("/api/apis/manage/inventory", { name, newSpec: spec });
}

export function previewManage(
  name: string,
  spec: ParsedSpec,
  toAdd: Record<string, string[]>,
  toRemove: Record<string, string[]>,
): Promise<ManagePreviewResult> {
  return post("/api/apis/manage/preview", { name, spec, toAdd, toRemove });
}

export function applyManage(
  name: string,
  spec: ParsedSpec,
  toAdd: Record<string, string[]>,
  toRemove: Record<string, string[]>,
): Promise<{ success: boolean; written: number; deleted: number }> {
  return post("/api/apis/manage/apply", { name, spec, toAdd, toRemove });
}
