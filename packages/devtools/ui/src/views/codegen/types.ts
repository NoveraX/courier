export interface ParsedSpec {
  title: string
  version: string
  description: string
  baseURL: string
  format: string
  groups: ParsedGroup[]
  schemas: Record<string, unknown>
}

export interface ParsedGroup {
  name: string
  description: string
  prefix: string
  endpoints: ParsedEndpoint[]
}

export interface ParsedEndpoint {
  name: string
  operationId: string | null
  httpMethod: string
  path: string
  fullPath: string
  description: string
  secured: boolean
  tags: string[]
}

export interface GenerateOptions {
  sourceName: string
  outputDir: string
  validation: "zod" | "valibot" | "arktype" | "none"
  groupBy: "tag" | "path" | "single"
  naming: "camelCase" | "as-is"
  generateTypes: boolean
  generateSchemas: boolean
  addAuthMiddleware: boolean
  includeComments: boolean
  generateClient: "direct" | "proxy" | "both" | "none"
  selectedEndpoints: Record<string, string[]> | null
}

export interface GeneratedFile {
  path: string
  content: string
}

export type ImportSource = "url" | "raw" | "file"
export type Step = "import" | "select" | "options" | "preview"

/** Per-source state persisted in config */
export interface SourceConfig {
  name: string
  importSource: ImportSource
  importContent: string
  options: GenerateOptions
  selectedEndpoints: Record<string, string[]>
}

/** Multi-source config file format */
export interface CodegenMultiConfig {
  sources: SourceConfig[]
}

/** Per-source runtime state (not persisted) */
export interface SourceState {
  spec: ParsedSpec | null
  prevSpec: ParsedSpec | null
  selection: Record<string, Set<string>>
  files: GeneratedFile[]
  activeFileIndex: number
}
