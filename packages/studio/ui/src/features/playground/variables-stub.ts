import type { CatalogEndpoint } from "@/store/types-ui";

/**
 * The variables the Playground starts an endpoint with: a sample read from
 * its variables schema, or else each path parameter left empty, with what
 * the endpoint's `.defaults()` fills in set to its default — or `{}`.
 *
 * @param endpoint - The endpoint's definition
 * @param indent - The indent the text is laid out with
 * @returns The variables, as JSON text
 * @example
 * ```ts
 * variablesStubOf({ path: ":id", ...def }, 2); // '{\n  "id": ""\n}'
 * ```
 */
export function variablesStubOf(endpoint: CatalogEndpoint | null, indent: number): string {
  if (!endpoint) return "{}";
  const sample = { ...sampleOf(endpoint), ...endpoint.variablesDefaults };
  return Object.keys(sample).length === 0 ? "{}" : JSON.stringify(sample, null, indent);
}

/* A sample of the variables' schema, or else each path parameter left empty. */
function sampleOf(endpoint: CatalogEndpoint): Record<string, unknown> {
  if (endpoint.variablesStub && Object.keys(endpoint.variablesStub).length > 0) {
    return endpoint.variablesStub;
  }
  const params = endpoint.path?.match(/:(\w+)/g) ?? [];
  return Object.fromEntries(params.map((p) => [p.slice(1), ""]));
}
