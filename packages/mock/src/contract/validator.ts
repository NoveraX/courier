import type { StandardSchemaV1 } from "@standard-schema/spec";

/** Symbol used by Courier core to attach schema metadata to endpoints */
const ENDPOINT_SCHEMA = Symbol.for("courier.endpoint.schema");

interface SchemaMetadata {
  response?: StandardSchemaV1;
  variables?: StandardSchemaV1;
  type?: "query" | "mutation";
}

/** Result of validating a single endpoint's mock */
export interface ContractResult {
  group: string;
  method: string;
  status: "pass" | "fail" | "skip";
  target?: "response" | "variables";
  issues?: ContractIssue[];
}

/** A single validation issue */
export interface ContractIssue {
  path: string;
  message: string;
}

/** Options for contract validation */
export interface ValidateOptions {
  /** Which direction to validate (default: "response") */
  direction?: "response" | "variables" | "both";
}

/**
 * Validate mock data against endpoint Standard Schema definitions.
 *
 * Walks all groups/endpoints in a source, extracts attached schemas,
 * and validates the mock handler output against them.
 */
export async function validateEndpoint(
  schema: StandardSchemaV1 | undefined,
  data: unknown,
  target: "response" | "variables",
): Promise<ContractResult & { group: string; method: string }> {
  if (!schema) {
    return { group: "", method: "", status: "skip" };
  }

  const result = await schema["~standard"].validate(data);

  if (result.issues) {
    const issues: ContractIssue[] = result.issues.map((issue) => ({
      path: formatPath(issue.path),
      message: issue.message,
    }));
    return { group: "", method: "", status: "fail", target, issues };
  }

  return { group: "", method: "", status: "pass", target };
}

/**
 * Extract schema metadata from an endpoint function.
 * Uses the same Symbol.for("courier.endpoint.schema") as core.
 */
export function getEndpointSchema(endpointFn: unknown): SchemaMetadata | undefined {
  if (typeof endpointFn !== "function") return undefined;
  return (endpointFn as unknown as Record<symbol, SchemaMetadata | undefined>)[ENDPOINT_SCHEMA];
}

/**
 * Validate all endpoints in a source against their schemas.
 * Returns results for each endpoint.
 */
export async function validateSource(
  source: Record<string, Record<string, unknown>>,
  mockData: Map<string, unknown>,
  options?: ValidateOptions,
): Promise<ContractResult[]> {
  const direction = options?.direction ?? "response";
  const results: ContractResult[] = [];

  for (const [groupName, group] of Object.entries(source)) {
    if (groupName === "options") continue;

    for (const [methodName, endpointFn] of Object.entries(group)) {
      if (methodName === "options") continue;

      const schema = getEndpointSchema(endpointFn);
      const key = `${groupName}/${methodName}`;
      const data = mockData.get(key);

      if (!schema) {
        results.push({ group: groupName, method: methodName, status: "skip" });
        continue;
      }

      if (direction === "response" || direction === "both") {
        if (schema.response && data !== undefined) {
          const result = await validateEndpoint(schema.response, data, "response");
          results.push({ ...result, group: groupName, method: methodName });
        } else if (schema.response) {
          results.push({ group: groupName, method: methodName, status: "skip" });
        }
      }

      if (direction === "variables" || direction === "both") {
        if (schema.variables) {
          results.push({
            group: groupName,
            method: methodName,
            status: "skip",
            target: "variables",
          });
        }
      }
    }
  }

  return results;
}

function formatPath(
  path: ReadonlyArray<PropertyKey | { readonly key: PropertyKey }> | undefined,
): string {
  if (!path?.length) return "(root)";
  return path
    .map((p) => (typeof p === "object" && p !== null && "key" in p ? String(p.key) : String(p)))
    .join(".");
}
