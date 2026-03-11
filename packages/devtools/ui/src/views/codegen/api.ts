import type {
  GenerateOptions,
  GeneratedFile,
  ImportSource,
  ParsedSpec,
  SourceSummary,
  SpecDiff,
  UpdateResult,
} from "./types"

const API_BASE = import.meta.env.DEV ? "http://localhost:4380" : ""

export async function fetchParseSpec(source: ImportSource, content: string): Promise<ParsedSpec> {
  const res = await fetch(`${API_BASE}/api/codegen/parse`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ source, content }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error ?? "Failed to parse spec")
  return data as ParsedSpec
}

export async function fetchGenerateCode(spec: ParsedSpec, options: GenerateOptions): Promise<GeneratedFile[]> {
  const res = await fetch(`${API_BASE}/api/codegen/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ spec, options }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error ?? "Code generation failed")
  return data.files as GeneratedFile[]
}

export interface WriteResult {
  written: number
  merged: number
  deleted?: number
  files: { path: string; status: string }[]
}

/**
 * Smart write: sends source info so server can merge with existing
 * files when source is already in registry (preserves user edits).
 * Also handles registry registration in one call.
 */
export async function fetchWriteFiles(
  files: GeneratedFile[],
  ctx?: {
    sourceName: string
    spec: ParsedSpec
    specSource: { type: ImportSource; value: string }
    options: GenerateOptions
  },
): Promise<WriteResult> {
  const res = await fetch(`${API_BASE}/api/codegen/write`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      files,
      sourceName: ctx?.sourceName,
      spec: ctx?.spec,
      specSource: ctx?.specSource,
      options: ctx?.options,
    }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error ?? "Failed to write files")
  return data as WriteResult
}

// ── Registry ───────────────────────────────────────────────────────────────

export async function fetchRegistrySources(): Promise<SourceSummary[]> {
  const res = await fetch(`${API_BASE}/api/codegen/registry/list`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error ?? "Failed to list sources")
  return data.sources as SourceSummary[]
}

export async function fetchRemoveSource(name: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/codegen/registry/remove`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  })
  if (!res.ok) {
    const data = await res.json()
    throw new Error(data.error ?? "Failed to remove source")
  }
}

export interface CheckUpdatesResult {
  changed: boolean
  diff?: SpecDiff
  newSpec?: ParsedSpec
  error?: string
}

export async function fetchCheckUpdates(name: string): Promise<CheckUpdatesResult> {
  const res = await fetch(`${API_BASE}/api/codegen/registry/check-updates`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error ?? "Failed to check updates")
  return data as CheckUpdatesResult
}

export async function fetchCheckAllUpdates(): Promise<Record<string, { changed: boolean; error?: string }>> {
  const res = await fetch(`${API_BASE}/api/codegen/registry/check-all`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error ?? "Failed to check sources")
  return data.results as Record<string, { changed: boolean; error?: string }>
}

// ── Update Flow ──────────────────────────────────────────────────────────────

export async function fetchUpdatePreview(name: string, newSpec: ParsedSpec): Promise<UpdateResult> {
  const res = await fetch(`${API_BASE}/api/codegen/update/preview`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, newSpec }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error ?? "Failed to preview update")
  return data as UpdateResult
}

export async function fetchUpdateApply(
  name: string,
  newSpec: ParsedSpec,
  files: { path: string; content: string }[],
): Promise<{ written: number }> {
  const res = await fetch(`${API_BASE}/api/codegen/update/apply`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, newSpec, files }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error ?? "Failed to apply update")
  return data as { written: number }
}
