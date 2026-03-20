import { useCallback, useState } from "react";
import { post } from "@/lib/api-client";
import { useDevToolsStore } from "@/store";
import type { ScanResult } from "@/views/apis/types";

import type {
  EndpointSelection,
  GeneratedFile,
  MockGeneratorOptions,
  MockGeneratorState,
  MockWizardStep,
} from "./types";

const DEFAULT_OPTIONS: MockGeneratorOptions = {
  outputDir: "src/mocks",
  port: 3001,
  seedCount: 20,
  connectDevTools: true,
};

const INITIAL_STATE: MockGeneratorState = {
  step: "source",
  selectedSources: [],
  standalone: false,
  options: DEFAULT_OPTIONS,
  endpoints: {},
  sourceFilePaths: {},
  generatedFiles: [],
  writing: false,
};

export interface UseMockGeneratorReturn {
  state: MockGeneratorState;
  open: boolean;
  error: string | null;
  loading: boolean;
  openWizard: () => void;
  close: () => void;
  goToStep: (step: MockWizardStep) => void;
  toggleSource: (sourceName: string) => void;
  setStandalone: (standalone: boolean) => void;
  setOptions: (patch: Partial<MockGeneratorOptions>) => void;
  toggleEndpoint: (source: string, group: string, endpoint: string) => void;
  toggleGroup: (source: string, group: string) => void;
  toggleAll: () => void;
  generatePreview: () => void;
  writeFiles: () => Promise<void>;
}

export function useMockGenerator(onSuccess?: () => void): UseMockGeneratorReturn {
  const [state, setState] = useState<MockGeneratorState>(INITIAL_STATE);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const openWizard = useCallback(() => {
    setState(INITIAL_STATE);
    setError(null);
    setOpen(true);
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    setError(null);
  }, []);

  const goToStep = useCallback((step: MockWizardStep) => {
    setState((s) => ({ ...s, step }));
    setError(null);
  }, []);

  const toggleSource = useCallback((sourceName: string) => {
    setState((s) => {
      const selected = s.selectedSources.includes(sourceName)
        ? s.selectedSources.filter((n) => n !== sourceName)
        : [...s.selectedSources, sourceName];

      // Output dir: src/mocks/{sourceName}
      const outputDir = selected.length === 1
        ? `src/mocks/${selected[0]}`
        : "src/mocks";

      return {
        ...s,
        selectedSources: selected,
        standalone: false,
        options: { ...s.options, outputDir },
      };
    });
  }, []);

  const setStandalone = useCallback((standalone: boolean) => {
    setState((s) => ({
      ...s,
      standalone,
      selectedSources: standalone ? [] : s.selectedSources,
      options: { ...s.options, outputDir: standalone ? "src/mocks" : s.options.outputDir },
    }));
  }, []);

  const setOptions = useCallback((patch: Partial<MockGeneratorOptions>) => {
    setState((s) => ({ ...s, options: { ...s.options, ...patch } }));
  }, []);

  const toggleEndpoint = useCallback((source: string, group: string, endpoint: string) => {
    setState((s) => {
      const endpoints = structuredClone(s.endpoints);
      const groupEndpoints = endpoints[source]?.[group];
      if (!groupEndpoints) return s;
      const ep = groupEndpoints.find((e) => e.endpoint === endpoint);
      if (ep) ep.selected = !ep.selected;
      return { ...s, endpoints };
    });
  }, []);

  const toggleGroup = useCallback((source: string, group: string) => {
    setState((s) => {
      const endpoints = structuredClone(s.endpoints);
      const groupEndpoints = endpoints[source]?.[group];
      if (!groupEndpoints) return s;
      const allSelected = groupEndpoints.every((e) => e.selected);
      for (const ep of groupEndpoints) {
        ep.selected = !allSelected;
      }
      return { ...s, endpoints };
    });
  }, []);

  const toggleAll = useCallback(() => {
    setState((s) => {
      const endpoints = structuredClone(s.endpoints);
      const allSelected = Object.values(endpoints)
        .flatMap((groups) => Object.values(groups))
        .flat()
        .every((e) => e.selected);

      for (const groups of Object.values(endpoints)) {
        for (const eps of Object.values(groups)) {
          for (const ep of eps) {
            ep.selected = !allSelected;
          }
        }
      }
      return { ...s, endpoints };
    });
  }, []);

  const generatePreview = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // Scan project to get real file paths for selected sources
      const scanResult = await post<ScanResult>("/api/apis/scan");
      const sourceFilePaths: Record<string, string> = {};
      for (const scanned of scanResult.sources) {
        if (state.selectedSources.includes(scanned.name)) {
          sourceFilePaths[scanned.name] = scanned.filePath;
        }
      }

      // Build endpoints from catalog
      const catalog = useDevToolsStore.getState().catalog;
      const endpoints: Record<string, Record<string, EndpointSelection[]>> = {};

      for (const sourceName of state.selectedSources) {
        const source = catalog[sourceName];
        if (!source) continue;

        endpoints[sourceName] = {};
        for (const [groupName, group] of Object.entries(source.groups)) {
          endpoints[sourceName][groupName] = Object.entries(group.endpoints).map(
            ([epName, ep]) => ({
              group: groupName,
              endpoint: epName,
              httpMethod: ep.httpMethod ?? inferHttpMethod(epName, ep.type, ep.path),
              path: ep.path ?? "",
              selected: true,
            }),
          );
        }
      }

      // Generate preview files with real paths
      const stateWithPaths = { ...state, endpoints, sourceFilePaths };
      const files = generateMockFiles(stateWithPaths, endpoints);

      setState((s) => ({
        ...s,
        step: "review",
        endpoints,
        sourceFilePaths,
        generatedFiles: files,
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [state]);

  const writeFiles = useCallback(async () => {
    setState((s) => ({ ...s, writing: true }));
    setError(null);

    try {
      await post("/api/apis/write", { files: state.generatedFiles });
      close();
      onSuccess?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setState((s) => ({ ...s, writing: false }));
    }
  }, [state.generatedFiles, close, onSuccess]);

  return {
    state,
    open,
    error,
    loading,
    openWizard,
    close,
    goToStep,
    toggleSource,
    setStandalone,
    setOptions,
    toggleEndpoint,
    toggleGroup,
    toggleAll,
    generatePreview,
    writeFiles,
  };
}

// ── File generation (placeholder) ─────────────────────────────────────────────

function generateMockFiles(
  state: MockGeneratorState,
  _endpoints: Record<string, Record<string, EndpointSelection[]>>,
): GeneratedFile[] {
  const { options, selectedSources, sourceFilePaths } = state;
  const dir = options.outputDir;
  const serverContent = buildServerFile(selectedSources, options, dir, sourceFilePaths);

  return [
    { path: `${dir}/server.ts`, content: serverContent },
  ];
}

function buildServerFile(
  sources: string[],
  options: MockGeneratorOptions,
  mockDir: string,
  sourceFilePaths: Record<string, string>,
): string {
  const imports = sources.map((s) => {
    const importPath = resolveRelativeImport(mockDir, sourceFilePaths[s] ?? `src/api/${s}`);
    return `import { ${s} } from "${importPath}";`;
  }).join("\n");

  const sourceArg = sources[0] ?? "api";

  return `import { createAutoMockServer } from "@noverax/nexus-mock";
${imports}

const server = createAutoMockServer({
  source: ${sourceArg},
  port: ${options.port},
  seed: { count: ${options.seedCount} },
});

const info = await server.start();
console.log(\`Mock server running at \${info.url}\`);
`;
}

/**
 * Compute relative import path from mock directory to source file.
 * E.g. mockDir="src/mocks/jsonPlaceholder", sourcePath="src/api/jsonPlaceholder/index.ts"
 * → "../api/jsonPlaceholder"
 */
function resolveRelativeImport(fromDir: string, toFilePath: string): string {
  // Strip file extension and /index suffix
  const toDir = toFilePath
    .replace(/\.(ts|tsx|js|jsx)$/, "")
    .replace(/\/index$/, "");

  const fromParts = fromDir.split("/").filter(Boolean);
  const toParts = toDir.split("/").filter(Boolean);

  // Find common prefix length
  let common = 0;
  while (common < fromParts.length && common < toParts.length && fromParts[common] === toParts[common]) {
    common++;
  }

  const ups = fromParts.length - common;
  const remainder = toParts.slice(common);

  const prefix = ups === 0 ? "./" : "../".repeat(ups);
  return prefix + remainder.join("/");
}

// ── HTTP method inference from catalog metadata ──────────────────────────────

function inferHttpMethod(
  endpointName: string,
  type: "query" | "mutation" | undefined,
  path: string | undefined,
): string {
  // Queries are always GET
  if (type === "query") return "GET";

  // Mutations: infer from endpoint name
  if (type === "mutation") {
    const lower = endpointName.toLowerCase();
    if (lower.startsWith("create") || lower.startsWith("add") || lower.startsWith("insert")) return "POST";
    if (lower.startsWith("delete") || lower.startsWith("remove") || lower === "del") return "DELETE";
    if (lower.startsWith("patch")) return "PATCH";
    if (lower.startsWith("update") || lower.startsWith("put") || lower.startsWith("replace")) return "PUT";
    // Mutation with :id path → PATCH, without → POST
    return path?.includes(":") ? "PATCH" : "POST";
  }

  // No type annotation: infer from name patterns
  const lower = endpointName.toLowerCase();
  if (lower.startsWith("get") || lower.startsWith("list") || lower.startsWith("find") || lower.startsWith("fetch")) return "GET";
  if (lower.startsWith("create") || lower.startsWith("add") || lower.startsWith("insert")) return "POST";
  if (lower.startsWith("update") || lower.startsWith("put") || lower.startsWith("replace")) return "PUT";
  if (lower.startsWith("patch") || lower.startsWith("edit")) return "PATCH";
  if (lower.startsWith("delete") || lower.startsWith("remove")) return "DELETE";

  return "GET";
}
