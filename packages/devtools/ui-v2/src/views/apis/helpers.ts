import type {
  ParsedSpec,
  ParsedGroup,
  ScannedSource,
  SourceSummary,
  GenerateOptions,
} from "./types";

// ── Endpoint counting ───────────────────────────────────────────────────────

export function countSpecEndpoints(spec: ParsedSpec): number {
  return spec.groups.reduce((sum, g) => sum + g.endpoints.length, 0);
}

export function countScannedEndpoints(source: ScannedSource): number {
  const grouped = source.groups.reduce((s, g) => s + g.endpoints.length, 0);
  return grouped + (source.inlineEndpoints?.length ?? 0);
}

// ── Analysis stats ──────────────────────────────────────────────────────────

export interface AnalysisStats {
  responseType: { count: number; total: number };
  variablesType: { count: number; total: number };
  validation: { count: number; total: number };
}

const BODY_METHODS = new Set(["post", "put", "patch"]);

/** Check if an endpoint needs variables (has path params or body method) */
function needsVariables(a: ScannedSource["groups"][number]["endpoints"][number]["analysis"]): boolean {
  return BODY_METHODS.has(a.httpMethod) || a.path.includes(":");
}

/** Count R/V/S stats from scanned endpoint analysis data */
export function computeAnalysisStats(source: ScannedSource): AnalysisStats {
  const allEndpoints = [
    ...source.groups.flatMap((g) => g.endpoints),
    ...(source.inlineEndpoints ?? []),
  ];

  let rCount = 0;
  let vCount = 0;
  let vTotal = 0;
  let sCount = 0;

  for (const ep of allEndpoints) {
    if (ep.analysis.hasResponseType) rCount++;
    if (ep.analysis.hasVariablesType) vCount++;
    if (ep.analysis.hasValidation) sCount++;
    if (needsVariables(ep.analysis) || ep.analysis.hasVariablesType) vTotal++;
  }

  return {
    responseType: { count: rCount, total: allEndpoints.length },
    variablesType: { count: vCount, total: vTotal },
    validation: { count: sCount, total: allEndpoints.length },
  };
}

// ── Selection helpers ───────────────────────────────────────────────────────

/** Build a "select all" map from parsed spec */
export function selectAllEndpoints(
  spec: ParsedSpec,
): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const group of spec.groups) {
    result[group.name] = group.endpoints.map((e) => e.name);
  }
  return result;
}

/** Count total selected endpoints across all groups */
export function countSelectedEndpoints(
  selected: Record<string, string[]>,
): number {
  return Object.values(selected).reduce((sum, arr) => sum + arr.length, 0);
}

/** Toggle a single endpoint in the selection map */
export function toggleEndpointSelection(
  selected: Record<string, string[]>,
  group: string,
  endpoint: string,
): Record<string, string[]> {
  const groupEndpoints = selected[group] ?? [];
  const has = groupEndpoints.includes(endpoint);
  return {
    ...selected,
    [group]: has
      ? groupEndpoints.filter((e) => e !== endpoint)
      : [...groupEndpoints, endpoint],
  };
}

/** Toggle all endpoints in a group */
export function toggleGroupSelection(
  selected: Record<string, string[]>,
  group: ParsedGroup,
): Record<string, string[]> {
  const current = selected[group.name] ?? [];
  const allSelected = current.length === group.endpoints.length;
  return {
    ...selected,
    [group.name]: allSelected ? [] : group.endpoints.map((e) => e.name),
  };
}

// ── Default options from settings ───────────────────────────────────────────

export function buildDefaultOptions(
  sourceName: string,
  settings: {
    apisValidation: string;
    apisGroupBy: string;
    apisGenerateTypes: boolean;
    apisGenerateSchemas: boolean;
    apisIncludeComments: boolean;
    apisClient: string;
  },
): GenerateOptions {
  return {
    sourceName,
    outputDir: "src/api",
    validation: settings.apisValidation as GenerateOptions["validation"],
    groupBy: settings.apisGroupBy as GenerateOptions["groupBy"],
    generateTypes: settings.apisGenerateTypes,
    generateSchemas: settings.apisGenerateSchemas,
    addAuthMiddleware: true,
    includeComments: settings.apisIncludeComments,
    generateClient: settings.apisClient as GenerateOptions["generateClient"],
    selectedEndpoints: null,
  };
}

// ── Format helpers ──────────────────────────────────────────────────────────

export function formatSpecFormat(format: string): string {
  const map: Record<string, string> = {
    openapi3: "OpenAPI 3.x",
    swagger2: "Swagger 2.0",
    postman: "Postman",
  };
  return map[format] ?? format;
}

export function formatImportType(type: string): string {
  const map: Record<string, string> = {
    url: "URL",
    file: "File",
    raw: "Raw",
  };
  return map[type] ?? type;
}

/** Determine import source label for a registry source */
export function sourceLabel(source: SourceSummary): string {
  if (source.importType === "url" && source.specUrl) return source.specUrl;
  return formatImportType(source.importType);
}
