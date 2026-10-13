/**
 * Generation, registry, scanner, diff, and import-wizard types.
 *
 * These shapes are owned by the codegen pipeline and the persisted source
 * registry, and re-exported via `types.ts`.
 */

import type { ProxyPath } from "@noverax/courier";
import type { SchemaField } from "@noverax/courier-studio-core";

import type { PlanConsent } from "@/features/apis/types-file-plan";
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
  /**
   * The options the import is generated with, a default filled in for each
   * one its declaration leaves out; empty for an import the config does not
   * declare, whose options Studio does not know.
   */
  options: Partial<PersistedGenerateOptions>;
  /** The import's last update check, from any page, while Studio runs; absent before one. */
  check?: ImportCheck | undefined;
  /** Its specification was read from the calls Studio recorded, which managing it reads again. */
  fromTraffic?: boolean | undefined;
}

/** What an import's last update check found, as Studio keeps it for every page. */
export interface ImportCheck {
  status: "up-to-date" | "updates-available" | "error";
  /** When the check ended, in epoch milliseconds. */
  checkedAt: number;
  /** Why the check failed. */
  error?: string | undefined;
}

// ── Scanner ─────────────────────────────────────────────────────────────────

/** What the project's `agents` policy decided for an endpoint, as Studio's server reports it. */
export interface AgentMark {
  /** Whether an agent can call it, as a tool of the project's MCP server. */
  offered: boolean;
  /** The tool it is offered as. */
  tool?: string;
  /** What a call does — offered, or kept out by the policy's `access`. */
  access?: "read" | "write" | "destructive";
  /** Whether a person confirms each call. */
  confirm?: boolean;
  /** Why, in the words the config uses: `marked .agent()`, `denied by billing.**`. */
  reason: string;
}

export interface EndpointAnalysis {
  hasResponseType: boolean;
  hasVariablesType: boolean;
  hasValidation: boolean;
  httpMethod: "get" | "head" | "options" | "query" | "post" | "put" | "patch" | "delete";
  path: string;
  type: "query" | "mutation" | null;
  /** How a stream or a channel is carried; absent for plain HTTP. */
  transport?: "sse" | "ws";
  /** The source's middleware, in the order it runs. */
  middleware?: string[];
  /** The variables its schema describes, with a placeholder for each field. */
  variablesStub?: Record<string, unknown>;
  /** The fields its variables schema declares, with their types and whether each is required. */
  variablesFields?: SchemaField[];
  /** What the endpoint's `.defaults()` fills in for a variable a call leaves out. */
  variablesDefaults?: Record<string, unknown>;
  /** A channel whose messages from the client have a schema. */
  hasReceiveSchema?: true;
  /** A stream or a channel the app serves itself, rather than an upstream. */
  served?: true;
  /** What the project's `agents` policy decided for it; absent for a stream or a channel. */
  agent?: AgentMark;
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
  /** Where the source's proxy routes are served, as `defineApi({ proxyPath })` sets them. */
  proxyPath?: ProxyPath;
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

/** What an update check found; `unchecked` for an import with no URL to fetch. */
export type SourceStatus = "up-to-date" | "updates-available" | "checking" | "error" | "unchecked";

export interface SourceStatusInfo {
  status: SourceStatus;
  /** Why the check failed, or why the import could not be checked. */
  error?: string | undefined;
  newSpec?: ParsedSpec | undefined;
  /** When the check ended, in epoch ms, on this page. */
  checkedAt?: number | undefined;
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
  /**
   * The module the config takes its `sources` from, when the config does not
   * write the list itself: the import line and the `sources` entry go there,
   * the `imports` entry in the config. `null` when everything goes in the config.
   */
  sourcesFile: string | null;
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
  /** The raw specification was read from the calls Studio recorded: the import stays tied to them. */
  fromTraffic: boolean;
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
