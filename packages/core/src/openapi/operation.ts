import type { PlacedEndpoint } from "./endpoints";
import { type ComponentSchemas, jsonSchemaOf } from "./json-schema";
import { inputOf } from "./parameters";
import type { SecurityPlan } from "./security";
import type { JSONSchema, JSONSchemaFallback, OpenAPIOperation } from "./types";

/** What an operation is written with besides its endpoint. */
export interface OperationContext {
  readonly version: "3.1.0" | "3.2.0";
  readonly components: ComponentSchemas;
  readonly security?: SecurityPlan | undefined;
  readonly fallback?: JSONSchemaFallback | undefined;
}

/** An endpoint as an operation of the document, or why it has none. */
export type BuiltOperation =
  | { path: string; method: string; operation: OpenAPIOperation; skipped?: undefined }
  | { skipped: string };

const UNSAFE: ReadonlySet<string> = new Set(["post", "put", "patch", "delete"]);

/**
 * An endpoint as an OpenAPI operation: its call's path in the client as
 * the operation id, its group as its tag, its variables as parameters or
 * a body, its answer, the session it needs, and what its meta says of it.
 * A channel has no form in OpenAPI; an endpoint the application serves
 * itself has no address; QUERY needs OpenAPI 3.2.
 *
 * @param endpoint - The endpoint
 * @param context - The document's version, components, security and fallback
 * @returns The operation, or why the document leaves the endpoint out
 * @example
 * ```ts
 * const built = operationOf(endpoint, { version: "3.1.0", components: new Map() });
 * ```
 */
export function operationOf(endpoint: PlacedEndpoint, context: OperationContext): BuiltOperation {
  if (endpoint.served)
    return { skipped: "the application serves it itself, so it has no address of its own" };
  if (endpoint.kind === "channel")
    return { skipped: "a channel (WebSocket) has no form in OpenAPI" };
  const method = endpoint.method === "del" ? "delete" : endpoint.method;
  if (method === "query" && context.version === "3.1.0") {
    return { skipped: "the QUERY method has no place in OpenAPI 3.1 — write 3.2.0" };
  }
  const named = { components: context.components, fallback: context.fallback };
  const variables = jsonSchemaOf(endpoint.schemas.variables, "input", {
    ...named,
    prefix: `${endpoint.id}.variables`,
  });
  const response = jsonSchemaOf(endpoint.schemas.response, "output", {
    ...named,
    prefix: `${endpoint.id}.response`,
  });
  const input = inputOf(endpoint, variables);
  const operation: OpenAPIOperation = {
    operationId: endpoint.id,
    ...described(endpoint),
    ...(input.parameters.length > 0 && { parameters: input.parameters }),
    ...(input.requestBody && { requestBody: input.requestBody }),
    responses: responsesOf(endpoint, response, context.version),
    ...securityFor(endpoint, method, context.security),
    ...(input.servers && { servers: input.servers }),
  };
  return { path: input.path, method, operation };
}

function described(endpoint: PlacedEndpoint): Partial<OpenAPIOperation> {
  const meta = endpoint.options.meta ?? {};
  const tags = [
    ...(endpoint.group === "" ? [] : [endpoint.group]),
    ...(endpoint.options.tags ?? []),
  ];
  const reason = endpoint.options.deprecated;
  const description = [textOf(meta.description), reason ? `Deprecated: ${reason}` : undefined]
    .filter((part) => part !== undefined)
    .join("\n\n");
  const summary = textOf(meta.summary);
  return {
    ...(summary !== undefined && { summary }),
    ...(description !== "" && { description }),
    ...(tags.length > 0 && { tags: [...new Set(tags)] }),
    ...(reason !== undefined && { deprecated: true }),
  };
}

function textOf(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

function responsesOf(
  endpoint: PlacedEndpoint,
  schema: JSONSchema | undefined,
  version: OperationContext["version"],
): Record<string, JSONSchema> {
  const failed = { default: { description: "An error the API answered with" } };
  if (endpoint.kind === "stream") {
    const events = schema ?? {};
    const media =
      version === "3.2.0"
        ? { itemSchema: events }
        : {
            schema: { type: "string", description: "Server-sent events" },
            "x-courier-event-schema": events,
          };
    return {
      "200": {
        description: "A stream of server-sent events",
        content: { "text/event-stream": media },
      },
      ...failed,
    };
  }
  if (schema === undefined) return { "200": { description: "Answered" }, ...failed };
  return {
    "200": { description: "Answered", content: { "application/json": { schema } } },
    ...failed,
  };
}

function securityFor(
  endpoint: PlacedEndpoint,
  method: string,
  plan: SecurityPlan | undefined,
): Partial<OpenAPIOperation> {
  if (plan === undefined) return {};
  if (endpoint.options.session === false) return { security: [] };
  return { security: UNSAFE.has(method) ? plan.write : plan.read };
}
