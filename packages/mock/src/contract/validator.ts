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
  /**
   * Which direction to validate (default: "response"): the mock data against
   * each endpoint's response schema, the `variables` against its variables
   * schema, or both.
   */
  direction?: "response" | "variables" | "both";
  /**
   * Request variables to check against each endpoint's variables schema,
   * keyed `group/method` as the mock data is — the variables a recorded
   * fixture or a mock's request history holds, for instance. An endpoint
   * with no entry here has its variables reported as skipped.
   */
  variables?: Map<string, unknown>;
}

/**
 * Validate one value against one of an endpoint's Standard Schemas.
 *
 * @param schema - The endpoint's response or variables schema; without one the check is skipped
 * @param data - The value to check
 * @param target - Which of the endpoint's schemas `schema` is
 * @returns The outcome, with an issue for each way `data` breaks the schema
 * @example
 * ```ts
 * const result = await validateEndpoint(getEndpointSchema(users.getById)?.response, user, "response");
 * ```
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
 * Validate every endpoint of a source against its schemas: the mock data
 * against each response schema and, when asked, the given variables against
 * each variables schema.
 *
 * Walks the groups of a `defineApi` result and its top-level endpoints. Mock
 * data and variables are keyed `"group/method"` for a grouped endpoint and
 * by its name alone for a top-level one. Every endpoint is reported once per
 * direction: one without a schema or without an entry is reported as skipped
 * rather than left out, so a report never reads as though it covered more
 * than it did.
 *
 * @param source   The API definition — grouped, flat or mixed
 * @param mockData The data each endpoint's mock answers, by key
 * @param options  The direction to check (default: `"response"`), and the variables to check
 * @returns One result per endpoint and direction, groups first
 * @example
 * ```ts
 * const results = await validateSource(api, new Map([["users/getById", user]]), {
 *   direction: "both",
 *   variables: new Map([["users/getById", { id: 1 }]]),
 * });
 * createContractReport(results).failed; // 0 when every entry matches its schema
 * ```
 */
export async function validateSource(
  source: AnyDefinedApi,
  mockData: Map<string, unknown>,
  options?: ValidateOptions,
): Promise<ContractResult[]> {
  const direction = options?.direction ?? "response";
  const variables = options?.variables ?? new Map<string, unknown>();
  const results: ContractResult[] = [];
  for (const { group, method, schema } of endpointsOf(source)) {
    const key = group ? `${group}/${method}` : method;
    const at = { group, method };
    if (direction !== "variables") {
      results.push({ ...(await checkTarget(schema.response, mockData, key, "response")), ...at });
    }
    if (direction !== "response") {
      results.push({
        ...(await checkTarget(schema.variables, variables, key, "variables")),
        ...at,
      });
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

/** Check one direction of one endpoint, or skip it when there is no schema or no data */
async function checkTarget(
  schema: StandardSchemaV1 | undefined,
  data: Map<string, unknown>,
  key: string,
  target: "response" | "variables",
): Promise<ContractResult> {
  if (!schema || !data.has(key)) return { group: "", method: "", status: "skip", target };
  return validateEndpoint(schema, data.get(key), target);
}

function formatPath(
  path: ReadonlyArray<PropertyKey | { readonly key: PropertyKey }> | undefined,
): string {
  if (!path?.length) return "(root)";
  return path
    .map((p) => (typeof p === "object" && p !== null && "key" in p ? String(p.key) : String(p)))
    .join(".");
}
