/**
 * Public type entry point for the APIs view.
 *
 * Re-exports the per-domain type modules so consumers keep importing from
 * `./types`. The actual type definitions live in:
 *   - `./types-parsed-spec` — parsed OpenAPI / Swagger / Postman shapes
 *   - `./types-generate`    — generation, registry, scanner, diff, wizard
 *   - `./types-manage`      — endpoint management dialog state
 */

export type {
  AgentMark,
  BreakingChange,
  BreakingSeverity,
  DiffEndpoint,
  EndpointAnalysis,
  GeneratedFile,
  GenerateOptions,
  ImportCheck,
  ImportDeclaration,
  ImportSource,
  ImportState,
  ImportStep,
  PersistedGenerateOptions,
  ScannedEndpoint,
  ScannedGroup,
  ScannedSource,
  ScanResult,
  SchemaDiff,
  SourceStatus,
  SourceStatusInfo,
  SourceSummary,
  SpecDiff,
  SpecImportType,
} from "./types-generate";
export type {
  EndpointInventory,
  FileChange,
  InventoryEndpoint,
  InventoryGroup,
  ManageAddResult,
  ManageEndpointStatus,
  ManageModificationStatus,
  ManagePreviewResult,
  ManageRemoveResult,
  ManageStep,
} from "./types-manage";
export type {
  ParsedEndpoint,
  ParsedGroup,
  ParsedParameter,
  ParsedSchema,
  ParsedSchemaProperty,
  ParsedSecurityScheme,
  ParsedSpec,
  SkippedOperation,
} from "./types-parsed-spec";
