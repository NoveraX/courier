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
export type CodegenTab = "import" | "registry" | "update"

// ── Registry ───────────────────────────────────────────────────────────────

export interface SpecSource {
  type: "url" | "file" | "raw"
  value: string
}

export interface SourceSummary {
  name: string
  version: string
  specSource: SpecSource
  outputDir: string
  options: GenerateOptions
  lastSynced: string
  endpointCount: number
  modifiedCount: number
}

export type SourceStatus = "up-to-date" | "updates-available" | "checking" | "error"

export interface SourceStatusInfo {
  status: SourceStatus
  error?: string
}

// ── Update Flow ──────────────────────────────────────────────────────────────

export type BreakingSeverity = "breaking" | "potentially-breaking" | "non-breaking"

export interface BreakingChange {
  severity: BreakingSeverity
  category: string
  message: string
  endpoint?: string
  schema?: string
}

export interface DiffEndpoint {
  group: string
  name: string
  method: string
  path: string
  changes?: string[]
}

export interface SchemaDiff {
  name: string
  type: "added" | "removed" | "modified"
  changes?: string[]
}

export interface SpecDiff {
  added: DiffEndpoint[]
  removed: DiffEndpoint[]
  modified: DiffEndpoint[]
  schemaChanges: SchemaDiff[]
  breakingChanges: BreakingChange[]
}

export type MergeStatus = "safe" | "merged" | "conflict"

export type MergeChangeType = "added" | "removed" | "updated" | "preserved"

export interface MergeChange {
  type: MergeChangeType
  target: string
  detail: string
}

export interface UpdateFileResult {
  path: string
  content: string
  status: MergeStatus
  changes: MergeChange[]
}

export interface UpdateResult {
  files: UpdateFileResult[]
  breakingChanges: BreakingChange[]
}

/** Context passed from registry to update view */
export interface UpdateContext {
  sourceName: string
  diff: SpecDiff
  newSpec: ParsedSpec
}

/** Per-source state persisted in config */
export interface SourceConfig {
  name: string
  importSource: ImportSource
  importContent: string
  options: GenerateOptions
  selectedEndpoints: Record<string, string[]>
}

/** Per-source runtime state (not persisted) */
export interface SourceState {
  spec: ParsedSpec | null
  prevSpec: ParsedSpec | null
  selection: Record<string, Set<string>>
  files: GeneratedFile[]
  activeFileIndex: number
}
