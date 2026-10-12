/**
 * The enterprise project's APIs as one OpenAPI document — what a large
 * company's backend publishes and Studio imports: an operation for each of
 * its HTTP endpoints, tagged by group, each group's records described once
 * and referred to wherever they are sent or answered with.
 */
import { httpEndpoints } from "./model.mjs";
import { pascal } from "./schemas-code.mjs";

const ID = { type: "string", minLength: 1 };
const TIME = { type: "string", format: "date-time" };

/* What each part a record may have is, as JSON Schema. */
const FIELD_SCHEMAS = {
  owner: {
    type: "object",
    required: ["id", "email"],
    properties: { id: ID, email: { type: "string", format: "email" }, name: { type: "string" } },
  },
  tags: { type: "array", items: { type: "string" }, maxItems: 20 },
  metadata: { type: "object", additionalProperties: { type: "string" } },
  amount: {
    type: "object",
    required: ["currency", "value"],
    properties: {
      currency: { type: "string", enum: ["USD", "EUR", "GBP"] },
      value: { type: "number" },
    },
  },
  address: {
    type: "object",
    required: ["line1", "city", "country"],
    properties: {
      line1: { type: "string" },
      line2: { type: "string" },
      city: { type: "string" },
      postcode: { type: "string" },
      country: { type: "string", minLength: 2, maxLength: 2 },
    },
  },
  priority: { type: "integer", minimum: 0, maximum: 5 },
  archived: { type: "boolean" },
  description: { type: "string", maxLength: 2000 },
  parentId: { type: ["string", "null"] },
  details: {
    oneOf: [
      {
        type: "object",
        required: ["type", "weight"],
        properties: { type: { const: "physical" }, weight: { type: "number" } },
      },
      {
        type: "object",
        required: ["type", "url"],
        properties: { type: { const: "digital" }, url: { type: "string", format: "uri" } },
      },
    ],
    discriminator: { propertyName: "type" },
  },
};

/**
 * The OpenAPI 3.1 document of a model's HTTP endpoints.
 *
 * @param {ReturnType<typeof import("./model.mjs").enterpriseModel>} model - The project's APIs
 * @returns {Record<string, unknown>} The document
 * @example
 * ```js
 * const spec = enterpriseOpenApi(enterpriseModel({ endpoints: 1000 }));
 * Object.keys(spec.paths).length;
 * ```
 */
export function enterpriseOpenApi(model) {
  const paths = {};
  const schemas = {};
  const tags = new Map();
  for (const { path, group, endpoint } of httpEndpoints(model)) {
    const tag = path.replaceAll(".", "_");
    const type = pascal(tag);
    tags.set(tag, `The ${group.entity} records${group.child ? " of each parent" : ""}`);
    if (!schemas[`${type}Item`]) Object.assign(schemas, recordSchemas(type, group.fields));
    const route = routeOf(path, endpoint.path);
    paths[route] ??= {};
    paths[route][endpoint.verb === "del" ? "delete" : endpoint.verb] = operationOf(
      tag,
      type,
      endpoint,
      route,
    );
  }
  return {
    openapi: "3.1.0",
    info: { title: "Enterprise platform", version: "2026.10.0" },
    servers: [{ url: "https://api.enterprise.example" }],
    tags: [...tags].map(([name, description]) => ({ name, description })),
    paths,
    components: { schemas: { ...schemas, ...sharedSchemas() } },
  };
}

function routeOf(groupPath, endpointPath) {
  const base = `/${groupPath.split(".").join("/")}`;
  const rest = endpointPath.replace(/:(\w+)/g, "{$1}");
  return rest === "" ? base : `${base}/${rest}`;
}

function operationOf(tag, type, endpoint, route) {
  const parameters = [...route.matchAll(/\{(\w+)\}/g)].map(([, name]) => ({
    name,
    in: "path",
    required: true,
    schema: ID,
  }));
  if (endpoint.shape === "list" || endpoint.shape === "childList") {
    parameters.push(
      { name: "page", in: "query", schema: { type: "integer", minimum: 1 } },
      { name: "size", in: "query", schema: { type: "integer", minimum: 1, maximum: 100 } },
    );
  }
  if (endpoint.shape === "search")
    parameters.push({
      name: "q",
      in: "query",
      required: true,
      schema: { type: "string", minLength: 1 },
    });
  const body =
    endpoint.shape === "create" || endpoint.shape === "childCreate"
      ? "Input"
      : endpoint.shape === "update"
        ? "Patch"
        : null;
  return {
    operationId: `${tag}_${endpoint.name}`,
    tags: [tag],
    summary: `${endpoint.name} ${tag.replaceAll("_", " ")}`,
    ...(parameters.length > 0 && { parameters }),
    ...(body && {
      requestBody: {
        required: true,
        content: {
          "application/json": { schema: { $ref: `#/components/schemas/${type}${body}` } },
        },
      },
    }),
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: answerOf(type, endpoint.shape) } },
      },
      404: {
        description: "Not found",
        content: { "application/json": { schema: { $ref: "#/components/schemas/Problem" } } },
      },
    },
  };
}

function answerOf(type, shape) {
  const item = { $ref: `#/components/schemas/${type}Item` };
  if (shape === "list" || shape === "childList" || shape === "search") {
    return {
      type: "object",
      required: ["items"],
      properties: {
        items: { type: "array", items: item },
        page: { type: "integer" },
        size: { type: "integer" },
        total: { type: "integer" },
      },
    };
  }
  if (shape === "removed")
    return {
      type: "object",
      required: ["id", "removed"],
      properties: { id: ID, removed: { type: "boolean" } },
    };
  if (shape === "export")
    return {
      type: "object",
      required: ["url"],
      properties: { url: { type: "string", format: "uri" }, expiresAt: TIME },
    };
  if (shape === "stats")
    return {
      type: "object",
      properties: {
        count: { type: "integer" },
        active: { type: "integer" },
        archived: { type: "integer" },
      },
    };
  if (shape === "history")
    return {
      type: "object",
      properties: {
        items: {
          type: "array",
          items: { type: "object", properties: { at: TIME, change: { type: "string" } } },
        },
      },
    };
  return item;
}

function recordSchemas(type, fields) {
  const properties = Object.fromEntries(
    fields.map((field) => [field, FIELD_SCHEMAS[field] ?? { type: "string" }]),
  );
  const input = {
    type: "object",
    required: ["name"],
    properties: {
      name: { type: "string", minLength: 1 },
      status: { $ref: "#/components/schemas/Status" },
      ...properties,
    },
  };
  return {
    [`${type}Item`]: {
      type: "object",
      required: ["id", "name", "status", "createdAt", "updatedAt"],
      properties: {
        id: ID,
        name: { type: "string" },
        status: { $ref: "#/components/schemas/Status" },
        ...properties,
        createdAt: TIME,
        updatedAt: TIME,
      },
    },
    [`${type}Input`]: input,
    [`${type}Patch`]: { ...input, required: [] },
  };
}

function sharedSchemas() {
  return {
    Status: { type: "string", enum: ["active", "pending", "archived", "suspended"] },
    Problem: {
      type: "object",
      required: ["message"],
      properties: { message: { type: "string" }, code: { type: "string" } },
    },
  };
}
