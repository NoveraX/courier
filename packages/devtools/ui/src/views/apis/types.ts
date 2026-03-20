// ── Parsed spec types (from server /api/apis/parse) ─────────────────────────

export interface ParsedSecurityScheme {
  name: string;
  type: "bearer" | "apiKey" | "basic" | "oauth2" | "unknown";
  paramName?: string;
  in?: "header" | "query" | "cookie";
}

export interface ParsedSchemaProperty {
  type: string;
  format?: string;
  required: boolean;
  description?: string;
  enum?: (string | number)[];
  items?: ParsedSchema;
  refName?: string;
  nullable?: boolean;
}

export interface ParsedSchema {
  name: string;
  type: "object" | "array" | "string" | "number" | "integer" | "boolean" | "enum" | "ref" | "any";
  properties?: Record<string, ParsedSchemaProperty>;
  items?: ParsedSchema;
  enum?: (string | number)[];
  required?: string[];
  refName?: string;
  description?: string;
}

export interface ParsedParameter {
  name: string;
  in: "path" | "query" | "header" | "cookie";
  required: boolean;
  type: string;
  description: string;
}

export interface ParsedEndpoint {
  name: string;
  operationId: string | null;
  httpMethod: "get" | "post" | "put" | "patch" | "delete";
  path: string;
  fullPath: string;
  description: string;
  secured: boolean;
  requestBody: ParsedSchema | null;
  parameters: ParsedParameter[];
  responseSchema: ParsedSchema | null;
  tags: string[];
}

export interface ParsedGroup {
  name: string;
  description: string;
  prefix: string;
  endpoints: ParsedEndpoint[];
}

export interface ParsedSpec {
  title: string;
  version: string;
  description: string;
  baseURL: string;
  format: "openapi3" | "swagger2" | "postman";
  groups: ParsedGroup[];
  schemas: Record<string, ParsedSchema>;
  securitySchemes: ParsedSecurityScheme[];
}

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

export type ImportStep = "import" | "select" | "options" | "preview";
export type ImportSource = "url" | "file" | "raw";

export interface ImportState {
  step: ImportStep;
  source: ImportSource;
  content: string;
  spec: ParsedSpec | null;
  options: GenerateOptions;
  selectedEndpoints: Record<string, string[]>;
  generatedFiles: GeneratedFile[];
  writing: boolean;
}

// ── Manage (endpoint management) ─────────────────────────────────────────────

export type ManageEndpointStatus = "active" | "available" | "custom" | "removed-from-spec";
export type ManageModificationStatus = "safe" | "modified";

export interface InventoryEndpoint {
  group: string;
  name: string;
  httpMethod: string;
  path: string;
  status: ManageEndpointStatus;
  modificationStatus?: ManageModificationStatus;
}

export interface InventoryGroup {
  name: string;
  prefix: string;
  endpoints: InventoryEndpoint[];
  isCustomGroup: boolean;
}

export interface EndpointInventory {
  groups: InventoryGroup[];
  specChanged: boolean;
  totalActive: number;
  totalAvailable: number;
  totalCustom: number;
}

export interface FileChange {
  path: string;
  content: string;
  action: "create" | "modify";
}

export interface ManageAddResult {
  files: FileChange[];
  sourceFileUpdate?: { path: string; content: string };
  indexFileUpdate?: { path: string; content: string };
  newFingerprints: Record<string, string>;
}

export interface ManageRemoveResult {
  modifiedFiles: Array<{ path: string; content: string }>;
  deletedFiles: string[];
  sourceFileUpdate?: { path: string; content: string };
  indexFileUpdate?: { path: string; content: string };
  removedFingerprints: string[];
  orphanedSchemas: string[];
  modifiedEndpointsWarning: string[];
}

export interface ManagePreviewResult {
  addResult?: ManageAddResult;
  removeResult?: ManageRemoveResult;
}

export type ManageStep = "loading" | "reupload" | "inventory" | "preview" | "applying" | "done";
