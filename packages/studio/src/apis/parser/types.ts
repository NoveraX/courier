/**
 * Normalized types for parsed API specifications.
 */

import type { SupportedHttpMethod } from "./http-methods";

export type { SpecNode } from "./spec-node";

export interface ParsedSpec {
  title: string;
  version: string;
  description: string;
  baseURL: string;
  format: "openapi3" | "swagger2" | "postman";
  groups: ParsedGroup[];
  schemas: Record<string, ParsedSchema>;
  securitySchemes: ParsedSecurityScheme[];
  /** Operations the spec declares that the builder API cannot express */
  skipped: SkippedOperation[];
  /** Set when no operation declares a tag: grouped by tag, none is in a group. */
  untagged?: true;
}

/**
 * An operation dropped during parsing, kept so an import can say what it left
 * behind instead of silently reporting a smaller endpoint count.
 */
export interface SkippedOperation {
  /** Uppercased HTTP method, e.g. "OPTIONS" */
  method: string;
  /** Path as written in the spec */
  path: string;
  reason: string;
}

export interface ParsedSecurityScheme {
  name: string;
  type: "bearer" | "apiKey" | "basic" | "oauth2" | "unknown";
  /** Header/query param name for apiKey type */
  paramName?: string | undefined;
  /** Where the key is sent for apiKey type */
  in?: "header" | "query" | "cookie" | undefined;
}

export interface ParsedGroup {
  /** The group's binding; `""` for the API's own endpoints, those in no group */
  name: string;
  /** Tag description from the spec (for JSDoc generation) */
  description: string;
  /** The path its endpoints share — after its parent group's, for a group inside one */
  prefix: string;
  /** The group it is generated inside, by name: an OpenAPI 3.2 tag's parent */
  parent?: string | undefined;
  endpoints: ParsedEndpoint[];
}

export interface ParsedEndpoint {
  /** Suggested camelCase name, e.g. "getById" */
  name: string;
  /** Original operation ID from spec */
  operationId: string | null;
  /** HTTP method */
  httpMethod: SupportedHttpMethod;
  /** Path relative to group prefix, e.g. "/:id" */
  path: string;
  /** Full original path, e.g. "/users/{id}" */
  fullPath: string;
  /**
   * Scheme and host the endpoint is sent to when they are not the spec's
   * `baseURL`, e.g. "https://auth.example.com" for a collection's login
   * request. `fullPath` is then a path on that host.
   */
  origin?: string | undefined;
  /** OpenAPI summary / description */
  description: string;
  /** Is this secured (has security scheme) */
  secured: boolean;
  /** Request body schema (if any) */
  requestBody: ParsedSchema | null;
  /**
   * Set when the operation does not require its body — OpenAPI's default —
   * so a call may send none. Read for a body that is not a set of fields: a
   * list, a scalar, a map, bytes.
   */
  requestBodyOptional?: true | undefined;
  /**
   * Media type the request body is sent as, e.g. `application/json`,
   * `application/x-www-form-urlencoded` or `multipart/form-data`; absent
   * when there is no body.
   */
  requestBodyMediaType?: string | undefined;
  /**
   * How each field of a url-encoded body is written, by field name, as the
   * specification's `encoding` declares it; absent when it declares none,
   * and every field is written as OpenAPI's defaults say.
   */
  requestBodyEncoding?: Record<string, FieldEncoding> | undefined;
  /** Path + query parameters */
  parameters: ParsedParameter[];
  /** Response schema (from 200/201 response) */
  responseSchema: ParsedSchema | null;
  /**
   * Media type of the success response, e.g. `application/json`, `text/csv`
   * or `application/pdf` — the one `responseSchema` describes, or the first
   * declared when none carries a schema; absent when the response has no body.
   */
  responseMediaType?: string | undefined;
  /** Tags from spec */
  tags: string[];
}

/**
 * How one field of a url-encoded body, or one query parameter, is written:
 * OpenAPI's `style` and `explode`.
 */
export interface FieldEncoding {
  style?: "form" | "spaceDelimited" | "pipeDelimited" | "deepObject" | undefined;
  explode?: boolean | undefined;
}

/**
 * What a value may hold beyond its type, from JSON Schema's validation
 * keywords. A request's schemas check them; an answer's do not, since a
 * validator that refuses what the API really sends is worse than none.
 */
export interface SchemaConstraints {
  /** A whole number: the specification types it `integer`. */
  integer?: true | undefined;
  minLength?: number | undefined;
  maxLength?: number | undefined;
  /**
   * A regular expression the string matches somewhere in it, as JavaScript
   * compiles it: with the `u` flag when it compiles so, else without.
   */
  pattern?: { source: string; unicode: boolean } | undefined;
  minimum?: number | undefined;
  maximum?: number | undefined;
  exclusiveMinimum?: number | undefined;
  exclusiveMaximum?: number | undefined;
  /** A whole number the value is a multiple of. */
  multipleOf?: number | undefined;
  minItems?: number | undefined;
  maxItems?: number | undefined;
}

export interface ParsedParameter {
  name: string;
  in: "path" | "query" | "header" | "cookie";
  required: boolean;
  type: string;
  description: string;
  /** Allowed values, when the specification lists them. */
  enum?: (string | number | boolean)[] | undefined;
  /** Element type of an array-valued parameter. */
  items?: ParsedSchema | undefined;
  /** `date-time`, `uuid`, and the rest. */
  format?: string | undefined;
  /**
   * How a query parameter is written, when not in OpenAPI's default style,
   * `form` exploded: Stripe's `created[gte]` and `expand[0]` are
   * `deepObject`, and a Swagger 2.0 list is joined with commas unless it
   * says otherwise.
   */
  encoding?: FieldEncoding | undefined;
  /**
   * The parameter's own schema, when it is an object or one of several
   * forms — Stripe's `created` is a timestamp or a range of them — which a
   * type name and a list of values cannot describe.
   */
  schema?: ParsedSchema | undefined;
  /** What its value may hold beyond its type. */
  constraints?: SchemaConstraints | undefined;
}

export interface ParsedSchema {
  name: string;
  type:
    | "object"
    | "array"
    | "string"
    | "number"
    | "integer"
    | "boolean"
    | "null"
    | "enum"
    | "ref"
    | "union"
    | "any";
  /**
   * Alternatives of a `oneOf` / `anyOf`.
   *
   * Keeping only the first silently narrowed 28 GitHub request bodies and 14
   * Stripe responses to one of their shapes.
   */
  variants?: ParsedSchema[] | undefined;
  properties?: Record<string, ParsedSchemaProperty> | undefined;
  items?: ParsedSchema | undefined;
  enum?: (string | number | boolean)[] | undefined;
  required?: string[] | undefined;
  /** Reference name for $ref schemas */
  refName?: string | undefined;
  description?: string | undefined;
  /** Value type of a map, from `additionalProperties`. */
  valueType?: ParsedSchema | undefined;
  /** What a primitive or a list may hold beyond its type. */
  constraints?: SchemaConstraints | undefined;
}

export interface ParsedSchemaProperty {
  type: string;
  format?: string | undefined;
  required: boolean;
  description?: string | undefined;
  enum?: (string | number | boolean)[] | undefined;
  items?: ParsedSchema | undefined;
  refName?: string | undefined;
  nullable?: boolean | undefined;
  /**
   * The property's own schema, when a primitive, a reference or a list
   * cannot describe it: an inline object, or one of several alternatives.
   *
   * Without it an inline object flattened to `Record<string, unknown>`, and a
   * property allowing several forms kept only the first reference among them.
   */
  shape?: ParsedSchema | undefined;
  /** Value type of a map, from `additionalProperties`. */
  valueType?: ParsedSchema | undefined;
  /**
   * The one direction the property travels in, when the specification says:
   * `read` for a readOnly field only the server sends, `write` for a
   * writeOnly one only the client sends. `required` leaves such a field
   * optional, since one schema serves both; `requiredInDirection` says
   * whether it is required where it travels, for the request and answer
   * types the schema is split into.
   */
  direction?: "read" | "write" | undefined;
  requiredInDirection?: boolean | undefined;
  /** What a primitive or a list may hold beyond its type. */
  constraints?: SchemaConstraints | undefined;
}

export type SpecFormat =
  | "openapi3-json"
  | "openapi3-yaml"
  | "swagger2-json"
  | "swagger2-yaml"
  | "postman"
  | "unknown";
