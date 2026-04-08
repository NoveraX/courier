/**
 * Parsed spec types — the data shape returned by the server's
 * `/api/apis/parse` endpoint after normalising OpenAPI/Swagger/Postman docs.
 *
 * Re-exported via `types.ts` as a stable surface.
 */

export interface ParsedSecurityScheme {
  name: string;
  type: "bearer" | "apiKey" | "basic" | "oauth2" | "unknown";
  paramName?: string;
  in?: "header" | "query" | "cookie";
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

export interface ParsedSchema {
  name: string;
  type: "object" | "array" | "string" | "number" | "integer" | "boolean" | "enum" | "ref" | "any";
  properties?: Record<string, ParsedSchemaProperty>;
  items?: ParsedSchema;
  enum?: (string | number)[];
  required?: string[];
  refName?: string;
  description?: string;
}

export interface ParsedParameter {
  name: string;
  in: "path" | "query" | "header" | "cookie";
  required: boolean;
  type: string;
  description: string;
}

export interface ParsedEndpoint {
  name: string;
  operationId: string | null;
  httpMethod: "get" | "post" | "put" | "patch" | "delete";
  path: string;
  fullPath: string;
  description: string;
  secured: boolean;
  requestBody: ParsedSchema | null;
  parameters: ParsedParameter[];
  responseSchema: ParsedSchema | null;
  tags: string[];
}

export interface ParsedGroup {
  name: string;
  description: string;
  prefix: string;
  endpoints: ParsedEndpoint[];
}

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
