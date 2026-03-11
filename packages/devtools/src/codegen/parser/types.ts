/**
 * Normalized types for parsed API specifications.
 */

export interface ParsedSpec {
  title: string;
  version: string;
  description: string;
  baseURL: string;
  format: "openapi3" | "swagger2" | "postman";
  groups: ParsedGroup[];
  schemas: Record<string, ParsedSchema>;
  securitySchemes: ParsedSecurityScheme[];
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
  httpMethod: "get" | "post" | "put" | "patch" | "delete";
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
}

export interface ParsedSchema {
  name: string;
  type: "object" | "array" | "string" | "number" | "integer" | "boolean" | "enum" | "ref" | "any";
  properties?: Record<string, ParsedSchemaProperty>;
  items?: ParsedSchema;
  enum?: (string | number)[];
  required?: string[];
  /** Reference name for $ref schemas */
  refName?: string;
  description?: string;
}

export interface ParsedSchemaProperty {
  type: string;
  format?: string;
  required: boolean;
  description?: string;
  enum?: (string | number)[];
  items?: ParsedSchema;
  refName?: string;
  nullable?: boolean;
}

export type SpecFormat =
  | "openapi3-json"
  | "openapi3-yaml"
  | "swagger2-json"
  | "swagger2-yaml"
  | "postman"
  | "unknown";
