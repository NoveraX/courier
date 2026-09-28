/**
 * Normalized types for parsed API specifications.
 */

import type { SupportedHttpMethod } from "./http-methods";

/** Loose type for raw spec JSON nodes — external specs are untyped by nature */
// biome-ignore lint/suspicious/noExplicitAny: external spec objects have arbitrary nested shapes
export type SpecNode = Record<string, any>;

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
  paramName?: string;
  /** Where the key is sent for apiKey type */
  in?: "header" | "query" | "cookie";
}

export interface ParsedGroup {
  name: string;
  /** Tag description from the spec (for JSDoc generation) */
  description: string;
  prefix: string;
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
  /** OpenAPI summary / description */
  description: string;
  /** Is this secured (has security scheme) */
  secured: boolean;
  /** Request body schema (if any) */
  requestBody: ParsedSchema | null;
  /** Path + query parameters */
  parameters: ParsedParameter[];
  /** Response schema (from 200/201 response) */
  responseSchema: ParsedSchema | null;
  /** Tags from spec */
  tags: string[];
}

export interface ParsedParameter {
  name: string;
  in: "path" | "query" | "header" | "cookie";
  required: boolean;
  type: string;
  description: string;
  /** Allowed values, when the specification lists them. */
  enum?: (string | number | boolean)[];
  /** Element type of an array-valued parameter. */
  items?: ParsedSchema;
  /** `date-time`, `uuid`, and the rest. */
  format?: string;
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
  variants?: ParsedSchema[];
  properties?: Record<string, ParsedSchemaProperty>;
  items?: ParsedSchema;
  enum?: (string | number | boolean)[];
  required?: string[];
  /** Reference name for $ref schemas */
  refName?: string;
  description?: string;
  /** Value type of a map, from `additionalProperties`. */
  valueType?: ParsedSchema;
}

export interface ParsedSchemaProperty {
  type: string;
  format?: string;
  required: boolean;
  description?: string;
  enum?: (string | number | boolean)[];
  items?: ParsedSchema;
  refName?: string;
  nullable?: boolean;
  /**
   * The property's own schema, when a primitive, a reference or a list
   * cannot describe it: an inline object, or one of several alternatives.
   *
   * Without it an inline object flattened to `Record<string, unknown>`, and a
   * property allowing several forms kept only the first reference among them.
   */
  shape?: ParsedSchema;
  /** Value type of a map, from `additionalProperties`. */
  valueType?: ParsedSchema;
}

export type SpecFormat =
  | "openapi3-json"
  | "openapi3-yaml"
  | "swagger2-json"
  | "swagger2-yaml"
  | "postman"
  | "unknown";
