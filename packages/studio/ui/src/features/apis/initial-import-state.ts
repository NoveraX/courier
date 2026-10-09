import type { ImportState } from "@/features/apis/types";

/** The import wizard's state when it opens. */
export const INITIAL_IMPORT_STATE: ImportState = {
  step: "import",
  source: "url",
  content: "",
  fromTraffic: false,
  spec: null,
  options: {
    sourceName: "api",
    outputDir: "src/api",
    validation: "zod",
    groupBy: "tag",
    generateTypes: true,
    generateSchemas: true,
    addAuthMiddleware: false,
    includeComments: true,
    generateClient: "direct",
    selectedEndpoints: null,
  },
  selectedEndpoints: {},
  generatedFiles: [],
  writing: false,
  declaration: null,
  consent: null,
};
