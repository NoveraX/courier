export type { GeneratedFile, GenerateOptions } from "./generator";
export { DEFAULT_OPTIONS, deriveSourceName, generateCode } from "./generator";
export type {
  BreakingChange,
  BreakingSeverity,
  DiffEndpoint,
  EndpointFingerprint,
  EndpointStatus,
  FingerprintResult,
  MergeChange,
  MergeResult,
  MergeStatus,
  RegistryConfig,
  RegistrySource,
  SchemaDiff,
  SpecDiff,
  SpecSource,
  UpdateChoices,
  UpdateResult,
} from "./merge";
export {
  classifyEndpoints,
  computeHash,
  diffSpecs,
  extractEndpoints,
  generateFingerprints,
  normalizeCode,
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
export type { SourceSummary } from "./registry";
export {
  addSource,
  computeSpecHash,
  getSource,
  hasSpecChanged,
  listSources,
  loadRegistry,
  removeSource,
  saveRegistry,
  updateFingerprints,
} from "./registry";
