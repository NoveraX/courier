import type { AnyDefinedApi } from "@noverax/courier/define";
import type { StandardSchemaV1 } from "@standard-schema/spec";

import { prop } from "../auto/schema-introspect/prop";

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
 * Read the schema metadata an endpoint carries.
 *
 * An endpoint is a descriptor stamped with the same
 * `Symbol.for("courier.endpoint.schema")` key core reads.
 */
export function getEndpointSchema(endpoint: unknown): SchemaMetadata | undefined {
  if (typeof endpoint !== "object" || endpoint === null) return undefined;
  return (endpoint as Record<symbol, SchemaMetadata | undefined>)[ENDPOINT_SCHEMA];
}

/**
 * Validate mock data for every endpoint of a source against its schemas.
 *
 * Walks the groups of a `defineApi` result and its top-level endpoints. Mock
 * data is keyed `"group/method"` for a grouped endpoint and by its name
 * alone for a top-level one. Every endpoint is reported once per direction:
 * one without a schema or without mock data is reported as skipped rather
 * than left out, so a report never reads as though it covered more than it did.
 *
 * @param source   The API definition — grouped, flat or mixed
 * @param mockData The data each endpoint's mock answers, by key
 * @param options  Which direction to validate (default: `"response"`)
 * @returns One result per endpoint and direction, groups first
 * @example
 * ```ts
 * const results = await validateSource(api, new Map([["users/getAll", mockUsers]]));
 * createContractReport(results).failed; // 0 when every mock matches its schema
 * ```
 */
export async function validateSource(
  source: AnyDefinedApi,
  mockData: Map<string, unknown>,
  options?: ValidateOptions,
): Promise<ContractResult[]> {
  const direction = options?.direction ?? "response";
  const results: ContractResult[] = [];
  for (const { group, method, schema } of endpointsOf(source)) {
    const data = mockData.get(group ? `${group}/${method}` : method);
    if (direction === "response" || direction === "both") {
      results.push(await checkResponse(group, method, schema, data));
    }
    if (direction === "variables" || direction === "both") {
      results.push({ group, method, status: "skip", target: "variables" });
    }
  }
  return results;
}

interface SourceEndpoint {
  group: string;
  method: string;
  schema: SchemaMetadata;
}

/* An entry without schema metadata is not an endpoint — a helper a user
   put beside them — and is left out. */
function* endpointsOf(source: AnyDefinedApi): Generator<SourceEndpoint> {
  const groups = prop(source, "options", "groups");
  for (const [group, members] of Object.entries(isObject(groups) ? groups : {})) {
    if (isObject(members)) yield* endpointsIn(group, members);
  }
  yield* endpointsIn("", source);
}

function isObject(value: unknown): value is object {
  return typeof value === "object" && value !== null;
}

function* endpointsIn(group: string, members: object): Generator<SourceEndpoint> {
  for (const [method, member] of Object.entries(members)) {
    if (method === "options") continue;
    const schema = getEndpointSchema(member);
    if (schema) yield { group, method, schema };
  }
}

async function checkResponse(
  group: string,
  method: string,
  schema: SchemaMetadata,
  data: unknown,
): Promise<ContractResult> {
  if (!schema.response || data === undefined) {
    return { group, method, status: "skip", target: "response" };
  }
  const result = await validateEndpoint(schema.response, data, "response");
  return { ...result, group, method };
}

function formatPath(
  path: ReadonlyArray<PropertyKey | { readonly key: PropertyKey }> | undefined,
): string {
  if (!path?.length) return "(root)";
  return path
    .map((p) => (typeof p === "object" && p !== null && "key" in p ? String(p.key) : String(p)))
    .join(".");
}
