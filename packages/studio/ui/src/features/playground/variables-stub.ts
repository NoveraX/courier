import type { CatalogEndpoint } from "@/store/types-ui";

/**
 * The variables the Playground starts an endpoint with: a sample read from
 * its variables schema, or else each path parameter left empty, or `{}`.
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
  if (endpoint.variablesStub && Object.keys(endpoint.variablesStub).length > 0) {
    return JSON.stringify(endpoint.variablesStub, null, indent);
  }
  const params = endpoint.path?.match(/:(\w+)/g);
  if (!params?.length) return "{}";
  return JSON.stringify(Object.fromEntries(params.map((p) => [p.slice(1), ""])), null, indent);
}
