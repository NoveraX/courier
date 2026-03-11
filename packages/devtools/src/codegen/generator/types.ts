/**
 * Generator options and output types.
 */

// ── Options ──────────────────────────────────────────────────────────────────

export interface GenerateOptions {
  /** Source name for the defineApi call */
  sourceName: string;
  /** Output directory (for file paths) */
  outputDir: string;
  /** Validation library */
  validation: "zod" | "valibot" | "arktype" | "none";
  /** Grouping strategy */
  groupBy: "tag" | "path" | "single";
  /** Generate TypeScript types */
  generateTypes: boolean;
  /** Generate validation schemas */
  generateSchemas: boolean;
  /** Add auth middleware to secured endpoints */
  addAuthMiddleware: boolean;
  /** Include JSDoc from descriptions */
  includeComments: boolean;
  /** Generate client file with createCaller/createProxyCaller */
  generateClient: "direct" | "proxy" | "both" | "none";
  /** Selected endpoints — map of groupName → Set<endpointName>, null = all */
  selectedEndpoints: Record<string, string[]> | null;
}

export const DEFAULT_OPTIONS: GenerateOptions = {
  sourceName: "api",
  outputDir: "src/api",
  validation: "zod",
  groupBy: "tag",
  generateTypes: true,
  generateSchemas: true,
  addAuthMiddleware: true,
  includeComments: true,
  generateClient: "direct",
  selectedEndpoints: null,
};

// ── Generated file ───────────────────────────────────────────────────────────

export interface GeneratedFile {
  /** Relative file path, e.g. "src/api/users.ts" */
  path: string;
  /** File content */
  content: string;
}
