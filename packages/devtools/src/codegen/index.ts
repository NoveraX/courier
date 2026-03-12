export type { GeneratedFile, GenerateOptions } from "./generator";
export { DEFAULT_OPTIONS, deriveSourceName, generateCode } from "./generator";
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
  RegistryConfig,
  RegistrySource,
  SchemaDiff,
  SpecDiff,
  SpecDigest,
  UpdateChoices,
  UpdateFileResult,
  UpdateResult,
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
export type { DigestCache, FingerprintCache, SourceSummary } from "./registry";
export {
  addSource,
  computeSpecHash,
  getCachedDigest,
  getCachedFingerprints,
  getSource,
  hasSpecChanged,
  listSources,
  loadCache,
  loadDigestCache,
  loadRegistry,
  removeCachedDigest,
  removeCachedSource,
  removeSource,
  saveCache,
  saveDigestCache,
  saveRegistry,
  updateCachedDigest,
  updateCachedFingerprints,
  updateSource,
} from "./registry";
export type {
  EndpointAnalysis,
  ScanConfig,
  ScannedEndpoint,
  ScannedGroup,
  ScannedSource,
  ScanResult,
} from "./scanner";
export { scanProject } from "./scanner";
