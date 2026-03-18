/**
 * HTTP client for DevTools APIs server endpoints.
 * All requests go through the Vite dev server proxy → Express backend.
 */

import type {
  EndpointInventory,
  GenerateOptions,
  GeneratedFile,
  ManagePreviewResult,
  ParsedSpec,
  ScanResult,
  SourceSummary,
  SpecDiff,
} from "./types";

// ── Helpers ─────────────────────────────────────────────────────────────────

async function post<TResult>(url: string, body?: unknown): Promise<TResult> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? `Request failed: ${res.status}`);
  }
  return res.json() as Promise<TResult>;
}

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

// ── Write ───────────────────────────────────────────────────────────────────

export function writeFiles(payload: {
  sourceName: string;
  spec: ParsedSpec;
  specUrl: string;
  importType: string;
  options: GenerateOptions;
  files: GeneratedFile[];
}): Promise<{ success: boolean }> {
  return post("/api/apis/write", payload);
}

// ── Registry ────────────────────────────────────────────────────────────────

export function fetchRegistrySources(): Promise<{ sources: SourceSummary[] }> {
  return post("/api/apis/registry/list");
}

export function removeRegistrySource(name: string): Promise<{ success: boolean }> {
  return post("/api/apis/registry/remove", { name });
}

export function checkSourceUpdates(
  name: string,
): Promise<{ changed: boolean; newSpec?: ParsedSpec }> {
  return post("/api/apis/registry/check-updates", { name });
}

export function checkAllUpdates(): Promise<{
  results: Record<string, { changed: boolean; error?: string }>;
}> {
  return post("/api/apis/registry/check-all");
}

// ── Scanner ─────────────────────────────────────────────────────────────────

export function scanProject(): Promise<ScanResult> {
  return post("/api/apis/scan");
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
