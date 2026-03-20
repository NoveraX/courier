export type MockWizardStep = "source" | "configure" | "review" | "preview";

export interface MockGeneratorState {
  step: MockWizardStep;
  /** Selected source names from catalog */
  selectedSources: string[];
  /** Standalone mode — no source, manual scenarios only */
  standalone: boolean;
  /** Generation options */
  options: MockGeneratorOptions;
  /** Endpoints grouped by source → group → endpoint[] */
  endpoints: Record<string, Record<string, EndpointSelection[]>>;
  /** Resolved file paths for selected sources (sourceName → filePath) */
  sourceFilePaths: Record<string, string>;
  /** Generated file previews */
  generatedFiles: GeneratedFile[];
  /** Writing to disk in progress */
  writing: boolean;
}

export interface MockGeneratorOptions {
  /** Output directory (default: src/mocks/{source}) */
  outputDir: string;
  /** Server port (default: 3001) */
  port: number;
  /** Seed count per collection (default: 20) */
  seedCount: number;
  /** Connect to DevTools on start */
  connectDevTools: boolean;
}

export interface EndpointSelection {
  group: string;
  endpoint: string;
  httpMethod: string;
  path: string;
  selected: boolean;
}

export interface GeneratedFile {
  path: string;
  content: string;
}
