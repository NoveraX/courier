import type {
  GenerateOptions,
  GeneratedFile,
  ImportSource,
  ParsedSpec,
} from "./types";

export const API_BASE = import.meta.env.DEV ? "http://localhost:4380" : "";

/**
 * Parse a spec from URL, file path, or raw content.
 * When called with a single string arg, auto-detects URL vs file path.
 * When called with two args, uses explicit source type (for import wizard).
 */
export async function fetchParseSpec(sourceOrUrl: ImportSource | string, content?: string): Promise<ParsedSpec> {
  /* Overload: single arg = specUrl (auto-detect), two args = explicit source + content */
  const body = content !== undefined
    ? { source: sourceOrUrl, content }
    : { source: /^https?:\/\//.test(sourceOrUrl) ? "url" : "file", content: sourceOrUrl };
  const res = await fetch(`${API_BASE}/api/codegen/parse`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Failed to parse spec");
  return data as ParsedSpec;
}

export async function fetchGenerateCode(spec: ParsedSpec, options: GenerateOptions): Promise<GeneratedFile[]> {
  const res = await fetch(`${API_BASE}/api/codegen/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ spec, options }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Code generation failed");
  return data.files as GeneratedFile[];
}

export interface WriteResult {
  written: number;
  merged: number;
  deleted?: number;
  files: { path: string; status: string }[];
}

/**
 * Smart write: sends source info so server can merge with existing
 * files when source is already in registry (preserves user edits).
 * Also handles registry registration in one call.
 */
export async function fetchWriteFiles(
  files: GeneratedFile[],
  ctx?: {
    sourceName: string;
    spec: ParsedSpec;
    specUrl: string;
    importType: ImportSource;
    options: GenerateOptions;
  },
): Promise<WriteResult> {
  const res = await fetch(`${API_BASE}/api/codegen/write`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      files,
      sourceName: ctx?.sourceName,
      spec: ctx?.spec,
      specUrl: ctx?.specUrl,
      importType: ctx?.importType,
      options: ctx?.options,
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Failed to write files");
  return data as WriteResult;
}
