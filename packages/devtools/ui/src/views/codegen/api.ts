import type { ImportSource, ParsedSpec, GenerateOptions, GeneratedFile, CodegenMultiConfig } from "./types"

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

export async function fetchWriteFiles(files: GeneratedFile[]): Promise<{ written: number }> {
  const res = await fetch(`${API_BASE}/api/codegen/write`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ files }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error ?? "Failed to write files")
  return data as { written: number }
}

export async function fetchSaveConfig(config: CodegenMultiConfig): Promise<{ path: string }> {
  const res = await fetch(`${API_BASE}/api/codegen/save-config`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ config }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error ?? "Failed to save config")
  return data as { path: string }
}

export async function fetchLoadConfig(): Promise<CodegenMultiConfig | null> {
  const res = await fetch(`${API_BASE}/api/codegen/load-config`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  })
  if (res.status === 404) return null
  const data = await res.json()
  if (!res.ok) return null
  return data as CodegenMultiConfig
}
