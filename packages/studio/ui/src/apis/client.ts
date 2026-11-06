/**
 * HTTP client for Studio APIs server endpoints.
 * All requests go through the Vite dev server proxy → Express backend.
 */

import type { ImportAuthRefs } from "@/features/apis/import-auth-draft";
import type {
  EndpointInventory,
  GeneratedFile,
  GenerateOptions,
  ParsedSpec,
  SpecDiff,
} from "@/features/apis/types";
import { post } from "@/lib/api-client";

// ── Parse ───────────────────────────────────────────────────────────────────

/**
 * Have Studio read a specification from a URL, with the auth whose
 * credentials the environment variables it names hold.
 *
 * @param url - Where the specification is
 * @param auth - What it is read with; none for a public one
 * @returns The specification, parsed
 * @example
 * ```ts
 * await parseSpecFromUrl(url, { type: "bearer", token: { env: "ORDERS_SPEC_TOKEN" } });
 * ```
 */
export function parseSpecFromUrl(url: string, auth?: ImportAuthRefs): Promise<ParsedSpec> {
  return post("/api/apis/parse", { source: "url", content: url, ...(auth && { auth }) });
}

/**
 * Have Studio read the specification of an import courier.config declares,
 * from the URL and with the auth the config gives it.
 *
 * @param name - The import, as courier.config names it
 * @returns The specification, parsed
 * @example
 * ```ts
 * await parseDeclaredSpec("orders");
 * ```
 */
export function parseDeclaredSpec(name: string): Promise<ParsedSpec> {
  return post("/api/apis/parse", { source: "import", content: name });
}

/** Whether Studio's environment sets a variable an import's auth names. */
export interface AuthVariable {
  name: string;
  set: boolean;
}

/**
 * Ask Studio which of the variables an import's auth names its environment
 * sets; their values are never answered.
 *
 * @param names - The variables
 * @returns Each variable, set or not
 * @example
 * ```ts
 * await authVariables(["ORDERS_SPEC_TOKEN"]); // → [{ name: "ORDERS_SPEC_TOKEN", set: true }]
 * ```
 */
export async function authVariables(names: string[]): Promise<AuthVariable[]> {
  const answer = await post<{ variables: AuthVariable[] }>("/api/apis/auth-variables", { names });
  return answer.variables;
}

export function parseSpecFromRaw(content: string): Promise<ParsedSpec> {
  return post("/api/apis/parse", { source: "raw", content });
}

// ── Generate ────────────────────────────────────────────────────────────────

export function generateCode(
  spec: ParsedSpec,
  options: GenerateOptions,
): Promise<{ files: GeneratedFile[] }> {
  return post("/api/apis/generate", { spec, options });
}

/** Where Studio would write an import's files. */
export interface ImportLayoutPreview {
  dir: string;
  sourceFile: string;
  sourceBinding: string;
}

/**
 * Ask Studio where an import's files would go. The wizard names the import
 * after its source, so both are the source name.
 *
 * @param outputDir - The output directory as typed
 * @param sourceName - The source name as typed
 * @returns The import's directory, its source file and the binding it exports
 * @throws Error with Studio's reason when it refuses the directory or the name
 * @example
 * ```ts
 * const { dir } = await previewLayout("src/api", "petStore"); // "src/api/pet-store"
 * ```
 */
export function previewLayout(outputDir: string, sourceName: string): Promise<ImportLayoutPreview> {
  return post("/api/apis/layout", { outputDir, sourceName, importName: sourceName });
}

// ── Imports ─────────────────────────────────────────────────────────────────

export function checkSourceUpdates(
  name: string,
): Promise<{ changed: boolean; newSpec?: ParsedSpec }> {
  return post("/api/apis/imports/check-updates", { name });
}

export function checkAllUpdates(): Promise<{
  /** By import: whether it changed; why the check failed; or why it cannot be checked. */
  results: Record<string, { changed: boolean; error?: string; unchecked?: string }>;
}> {
  return post("/api/apis/imports/check-all");
}

// ── Diff ────────────────────────────────────────────────────────────────────

export function diffSpecs(oldSpec: ParsedSpec, newSpec: ParsedSpec): Promise<SpecDiff> {
  return post("/api/apis/diff", { oldSpec, newSpec });
}

// ── Manage ───────────────────────────────────────────────────────────────────

export function fetchInventory(name: string, spec: ParsedSpec): Promise<EndpointInventory> {
  return post("/api/apis/manage/inventory", { name, newSpec: spec });
}
