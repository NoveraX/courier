import { probeOptions } from "../define/probe";
import { isFormData, sendsVariablesInQuery } from "../utils/helpers";
import { parseUrl } from "../utils/parse-url";
import { fillPathParams, type PathParam, pathPieces } from "../utils/path-template";
import type { PlacedEndpoint } from "./endpoints";
import type { JSONSchema } from "./types";

/** Where an operation's input goes: its path, parameters and body. */
export interface OperationInput {
  /** The path as OpenAPI writes it: `/users/{id}` */
  readonly path: string;
  readonly parameters: JSONSchema[];
  readonly requestBody?: JSONSchema | undefined;
  /** An endpoint on an address of its own */
  readonly servers?: Array<{ url: string }> | undefined;
}

/* Headers a session or the proxy writes itself, which an operation's parameters do not repeat. */
const WRITTEN_FOR_IT = new Set(["authorization", "cookie", "content-type", "accept"]);

/* OpenAPI has no form for a path parameter whose value spans segments, as `{+name}` does. */
const KEEPS_SLASHES = "Sent with its slashes as written, each part between them encoded";

/**
 * Where an endpoint's variables go, as Courier sends them: a path
 * parameter fills its place in the path, the rest go in the query string
 * for GET, HEAD, OPTIONS and DELETE, and in the body for the others — as
 * JSON, or url-encoded or multipart where the endpoint's closure sends a
 * form. A query written into the path is a parameter with its one value.
 *
 * @param endpoint - The endpoint
 * @param variables - Its variables as JSON Schema, when it has a schema
 * @returns Its path, parameters and body
 * @example
 * ```ts
 * inputOf(endpoint, { type: "object", properties: { id: { type: "string" } }, required: ["id"] });
 * ```
 */
export function inputOf(
  endpoint: PlacedEndpoint,
  variables: JSONSchema | undefined,
): OperationInput {
  const { path, servers, fixed } = addressOf(endpoint.path);
  const params = pathPieces(path).filter((piece): piece is PathParam => piece.kind === "param");
  const names = params.map(({ name }) => name);
  const properties = propertiesOf(variables);
  const parameters: JSONSchema[] = [
    ...params.map(({ name, keepsSlashes }) => ({
      name,
      in: "path",
      required: true,
      schema: ownProperty(properties, name) ?? { type: "string" },
      ...(keepsSlashes && { description: KEEPS_SLASHES }),
    })),
    ...[...fixed].map(([name, value]) => ({
      name,
      in: "query",
      required: true,
      schema: { type: "string", enum: [value] },
    })),
    ...headerParameters(endpoint),
  ];
  const rest = without(variables, names);
  const inQuery = sendsVariablesInQuery(endpoint.method === "del" ? "delete" : endpoint.method);
  if (inQuery) parameters.push(...queryParameters(rest));
  return {
    /* OpenAPI writes a parameter in braces, and a colon is its own text there. */
    path: `/${fillPathParams(path, (name) => `{${name}}`)}`,
    parameters,
    ...(!inQuery && { requestBody: bodyOf(endpoint, rest) }),
    ...(servers && { servers }),
  };
}

function addressOf(written: string): {
  path: string;
  servers?: Array<{ url: string }>;
  fixed: URLSearchParams;
} {
  const absolute = /^https?:\/\//i.test(written) ? parseUrl(written) : undefined;
  const local = absolute ? `${absolute.pathname}${absolute.search}` : written;
  const at = local.indexOf("?");
  const path = (at < 0 ? local : local.slice(0, at)).replace(/^\/+/, "");
  const fixed = new URLSearchParams(at < 0 ? "" : local.slice(at + 1));
  return { path, fixed, ...(absolute && { servers: [{ url: absolute.origin }] }) };
}

function propertiesOf(schema: JSONSchema | undefined): Record<string, JSONSchema> {
  const properties = schema?.properties;
  return typeof properties === "object" && properties !== null
    ? (properties as Record<string, JSONSchema>)
    : {};
}

/* A property the variables' schema declares itself: read by name, a path parameter named
   `constructor` it lacks took Object's own constructor for its schema. */
function ownProperty(properties: Record<string, JSONSchema>, name: string): JSONSchema | undefined {
  return Object.hasOwn(properties, name) ? properties[name] : undefined;
}

/* The variables' schema without the properties the path takes. */
function without(schema: JSONSchema | undefined, names: readonly string[]): JSONSchema | undefined {
  if (schema === undefined || names.length === 0 || schema.type !== "object") return schema;
  const properties = Object.fromEntries(
    Object.entries(propertiesOf(schema)).filter(([name]) => !names.includes(name)),
  );
  const required = Array.isArray(schema.required)
    ? schema.required.filter((name) => typeof name === "string" && !names.includes(name))
    : undefined;
  return { ...schema, properties, ...(required && { required }) };
}

function queryParameters(schema: JSONSchema | undefined): JSONSchema[] {
  const required = new Set(Array.isArray(schema?.required) ? schema.required : []);
  return Object.entries(propertiesOf(schema)).map(([name, property]) => ({
    name,
    in: "query",
    required: required.has(name),
    schema: property,
    ...(property.type === "object" && { style: "deepObject", explode: true }),
  }));
}

function bodyOf(endpoint: PlacedEndpoint, schema: JSONSchema | undefined): JSONSchema {
  const media = mediaTypeOf(probeOptions(endpoint.probe));
  return {
    required: schema !== undefined,
    content: { [media]: schema === undefined ? {} : { schema } },
  };
}

/* The body's form, as the endpoint's closure hands it to the wire. */
function mediaTypeOf(options: unknown): string {
  const body: unknown =
    typeof options === "object" && options !== null ? Reflect.get(options, "body") : undefined;
  if (body instanceof URLSearchParams) return "application/x-www-form-urlencoded";
  if (isFormData(body)) return "multipart/form-data";
  if (body instanceof Blob || body instanceof ArrayBuffer || ArrayBuffer.isView(body)) {
    return "application/octet-stream";
  }
  return "application/json";
}

function headerParameters(endpoint: PlacedEndpoint): JSONSchema[] {
  const named = (endpoint.options.allowedHeaders ?? []).filter(
    (name) => !WRITTEN_FOR_IT.has(name.toLowerCase()),
  );
  return [
    ...named.map((name) => ({ name, in: "header", required: false, schema: { type: "string" } })),
    ...idempotencyParameter(endpoint.options.idempotencyKey),
  ];
}

/* `header:idempotency-key` — where the endpoint reads the key every attempt of a call repeats. */
function idempotencyParameter(key: string | undefined): JSONSchema[] {
  const [where, name] = key?.split(":", 2) ?? [];
  if ((where !== "header" && where !== "query") || !name) return [];
  const description =
    "One key for every attempt of the same call, so a repeated write is applied once";
  return [{ name, in: where, required: false, schema: { type: "string" }, description }];
}
