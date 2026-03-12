/** Analysis of a single endpoint's code quality */
export interface EndpointAnalysis {
  /** Has explicit response type generic */
  hasResponseType: boolean;
  /** Has explicit variables type generic */
  hasVariablesType: boolean;
  /** Has runtime validation schema (response/variables) */
  hasValidation: boolean;
  /** HTTP method (get, post, put, patch, del) */
  httpMethod: string;
  /** URL path from the endpoint call */
  path: string;
  /** Endpoint type hint ("query" | "mutation" | null) */
  type: "query" | "mutation" | null;
}

/** A single scanned endpoint */
export interface ScannedEndpoint {
  name: string;
  analysis: EndpointAnalysis;
}

/** A scanned group (defineGroup) */
export interface ScannedGroup {
  name: string;
  prefix: string;
  filePath: string;
  endpoints: ScannedEndpoint[];
}

/** A scanned API source (defineApi) */
export interface ScannedSource {
  name: string;
  baseURL: string;
  filePath: string;
  groups: ScannedGroup[];
  /** Endpoints defined directly in defineApi({ endpoints: { ... } }) */
  inlineEndpoints?: ScannedEndpoint[];
  /** Whether this source has an entry in registry.nexus.json */
  isImported: boolean;
  /** Has createCaller() or createProxyCaller() */
  hasClient: boolean;
}

/** Scanner configuration */
export interface ScanConfig {
  /** Directories to scan (relative to project root) */
  scanPaths: string[];
  /** Glob patterns to ignore */
  ignore: string[];
}

/** Result of a full scan */
export interface ScanResult {
  sources: ScannedSource[];
  scannedFiles: number;
}
