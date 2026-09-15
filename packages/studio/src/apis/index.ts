export type {
  GeneratedFile,
  GenerateOptions,
  ResolvedGenerateOptions,
} from "./generator";
export { applyImportDefaults, DEFAULT_OPTIONS, deriveSourceName, generateCode } from "./generator";
export type { ImportStateEntry, ImportsState } from "./imports-state";
export {
  hasSpecChanged,
  IMPORTS_STATE_FILENAME,
  IMPORTS_STATE_VERSION,
  loadImportsState,
  recordImport,
  removeImport,
  resolveImportsStatePath,
  saveImportsState,
} from "./imports-state";
export type {
  BreakingChange,
  BreakingSeverity,
  DiffableSpec,
  DiffEndpoint,
  EndpointStatus,
  ExistingEndpointInfo,
  ExistingGroupInfo,
  FingerprintResult,
  MergeChange,
  MergeResult,
  MergeStatus,
  ParsedImport,
  SchemaDiff,
  SpecDiff,
  SpecDigest,
} from "./merge";
export {
  classifyEndpoints,
  computeHash,
  createSpecDigest,
  diffSpecs,
  extractEndpoints,
  generateFingerprints,
  mergeGroupFile,
  mergeImports,
  normalizeCode,
  parseExistingGroup,
  previewUpdate,
  splitEndpoint,
} from "./merge";
export type {
  ParsedEndpoint,
  ParsedGroup,
  ParsedSchema,
  ParsedSchemaProperty,
  ParsedSecurityScheme,
  ParsedSpec,
  SpecFormat,
} from "./parser";
export { detectFormat, parseSpec } from "./parser";
export type {
  RemovedEndpointAction,
  UpdateChoices,
  UpdateFileResult,
  UpdateResult,
} from "./registry";
export { computeSpecHash } from "./registry";
