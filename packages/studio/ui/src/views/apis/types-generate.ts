/**
 * Generation, registry, scanner, diff, and import-wizard types.
 *
 * These shapes are owned by the codegen pipeline and the persisted source
 * registry, and re-exported via `types.ts`.
 */

import type { PlanConsent } from "./types-file-plan";
import type { ParsedSpec } from "./types-parsed-spec";

// ── Generate options ────────────────────────────────────────────────────────

export interface GenerateOptions {
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
}

export interface GeneratedFile {
  path: string;
  content: string;
}

// ── Registry ────────────────────────────────────────────────────────────────

export type SpecImportType = "url" | "file" | "raw";

export type PersistedGenerateOptions = Omit<GenerateOptions, "selectedEndpoints">;

export interface SourceSummary {
  name: string;
  specUrl: string;
  importType: SpecImportType;
  outputDir: string;
  options: PersistedGenerateOptions;
}

// ── Scanner ─────────────────────────────────────────────────────────────────

export interface EndpointAnalysis {
  hasResponseType: boolean;
  hasVariablesType: boolean;
  hasValidation: boolean;
  httpMethod: "get" | "post" | "put" | "patch" | "delete";
  path: string;
  type: "query" | "mutation" | null;
  /** How a stream or a channel is carried; absent for plain HTTP. */
  transport?: "sse" | "ws";
  /** The source's middleware, in the order it runs. */
  middleware?: string[];
}

export interface ScannedEndpoint {
  name: string;
  analysis: EndpointAnalysis;
}

export interface ScannedGroup {
  name: string;
  prefix: string;
  filePath: string;
  endpoints: ScannedEndpoint[];
}

export interface ScannedSource {
  name: string;
  baseURL: string;
  filePath: string;
  groups: ScannedGroup[];
  inlineEndpoints?: ScannedEndpoint[];
  isImported: boolean;
  hasClient: boolean;
}

export interface ScanResult {
  sources: ScannedSource[];
  scannedFiles: number;
}

// ── Diff & update ───────────────────────────────────────────────────────────

export type BreakingSeverity = "breaking" | "potentially-breaking" | "non-breaking";

export interface BreakingChange {
  severity: BreakingSeverity;
  category: string;
  message: string;
  endpoint?: string;
  schema?: string;
}

export interface DiffEndpoint {
  group: string;
  name: string;
  method: string;
  path: string;
  changes?: string[];
}

export interface SchemaDiff {
  name: string;
  type: "added" | "removed" | "modified";
  changes?: string[];
}

export interface SpecDiff {
  added: DiffEndpoint[];
  removed: DiffEndpoint[];
  modified: DiffEndpoint[];
  schemaChanges: SchemaDiff[];
  breakingChanges: BreakingChange[];
}

export type SourceStatus = "up-to-date" | "updates-available" | "checking" | "error";

export interface SourceStatusInfo {
  status: SourceStatus;
  error?: string;
  newSpec?: ParsedSpec;
}

// ── Import wizard state ─────────────────────────────────────────────────────

/** The wizard's steps; `declare` follows a write the config does not declare all of. */
export type ImportStep = "import" | "select" | "options" | "preview" | "declare";
export type ImportSource = "url" | "file" | "raw";

/**
 * What courier.config must still declare for an import Studio wrote, as
 * Studio answered the write. Studio changes no config; a part the config
 * declares already is `null`.
 */
export interface ImportDeclaration {
  /** The config to edit, relative to the project root. */
  configFile: string;
  /** The import of the generated source, and its entry under `sources`, which Studio lists APIs from. */
  source: { importLine: string; entry: string } | null;
  /** The entry under `imports`, which Studio regenerates, merges and checks the import from. */
  importEntry: string | null;
  /** How many endpoints the write left out, which the `imports` entry cannot keep; 0 when none. */
  leftOut: number;
}

export interface ImportState {
  step: ImportStep;
  source: ImportSource;
  content: string;
  spec: ParsedSpec | null;
  options: GenerateOptions;
  selectedEndpoints: Record<string, string[]>;
  generatedFiles: GeneratedFile[];
  writing: boolean;
  /** What is left to declare after the write; `null` before it, and once nothing is. */
  declaration: ImportDeclaration | null;
  /** The plan Studio refused to apply unasked, with the steps the user allowed; `null` until a write is refused. */
  consent: PlanConsent | null;
}
