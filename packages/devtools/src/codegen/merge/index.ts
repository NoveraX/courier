export { extractEndpoints } from "./extract-endpoints";
export { classifyEndpoints, generateFingerprints } from "./fingerprint";
export { computeHash, normalizeCode } from "./hash";
export { diffSpecs } from "./spec-diff";
export type {
  BreakingChange,
  BreakingSeverity,
  DiffEndpoint,
  EndpointFingerprint,
  EndpointStatus,
  FingerprintResult,
  MergeChange,
  MergeChangeType,
  MergeResult,
  MergeStatus,
  RegistryConfig,
  RegistrySource,
  RemovedEndpointAction,
  SchemaDiff,
  SpecDiff,
  SpecSource,
  UpdateChoices,
  UpdateFileResult,
  UpdateResult,
} from "./types";
