import { client, rethrowMessage } from "./client";
import type {
  GenerateOptions,
  GeneratedFile,
  ImportSource,
  ParsedSpec,
} from "./types";

/**
 * Parse a spec from URL, file path, or raw content.
 * When called with a single string arg, auto-detects URL vs file path.
 * When called with two args, uses explicit source type (for import wizard).
 */
export async function fetchParseSpec(sourceOrUrl: ImportSource | string, content?: string): Promise<ParsedSpec> {
  const body = content !== undefined
    ? { source: sourceOrUrl, content }
    : { source: /^https?:\/\//.test(sourceOrUrl) ? "url" : "file", content: sourceOrUrl };

  return client.post<ParsedSpec>("/api/apis/parse", { json: body })
    .catch(rethrowMessage("Failed to parse spec"));
}

export async function fetchGenerateCode(spec: ParsedSpec, options: GenerateOptions): Promise<GeneratedFile[]> {
  const data = await client.post<{ files: GeneratedFile[] }>("/api/apis/generate", {
    json: { spec, options },
  }).catch(rethrowMessage("Code generation failed"));
  return data.files;
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
  return client.post<WriteResult>("/api/apis/write", {
    json: {
      files,
      sourceName: ctx?.sourceName,
      spec: ctx?.spec,
      specUrl: ctx?.specUrl,
      importType: ctx?.importType,
      options: ctx?.options,
    },
  }).catch(rethrowMessage("Failed to write files"));
}