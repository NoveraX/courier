import type { StandardSchemaV1 } from "@standard-schema/spec";

/** A JSON Schema, as OpenAPI 3.1 and 3.2 take one: the 2020-12 dialect. */
export type JSONSchema = Record<string, unknown>;

/** Which way a schema is read: what a call sends, or what it answers with. */
export type SchemaSide = "input" | "output";

/**
 * Turns a schema its library cannot describe as JSON Schema itself into
 * one — Valibot's, with `@valibot/to-json-schema` — or answers `undefined`
 * to leave it unspecified.
 */
export type JSONSchemaFallback = (
  schema: StandardSchemaV1,
  side: SchemaSide,
) => JSONSchema | undefined;

/** An endpoint the document leaves out, and why. */
export interface SkippedEndpoint {
  /** The call's path in the client, `users.list` */
  readonly operation: string;
  readonly reason: string;
}

/** How `toOpenAPI` writes the document. */
export interface OpenAPIOptions {
  /** The document's title, version and description; the title defaults to the API's name */
  readonly info?: { title?: string; version?: string; description?: string } | undefined;
  /**
   * The OpenAPI version written, `3.1.0` by default. `3.2.0` adds what 3.1
   * has no place for: the QUERY method, a stream's event schema, and nested
   * tags for nested groups.
   */
  readonly openapi?: "3.1.0" | "3.2.0" | undefined;
  /** Where the API is served; its absolute `baseURL` by default */
  readonly servers?: ReadonlyArray<{ url: string; description?: string }> | undefined;
  /** For schemas whose library has no Standard JSON Schema converter */
  readonly jsonSchema?: JSONSchemaFallback | undefined;
  /** Told of each endpoint the document leaves out — a channel, say — and why */
  readonly onSkip?: ((skipped: SkippedEndpoint) => void) | undefined;
}

/** An operation of the document, as OpenAPI writes it. */
export interface OpenAPIOperation {
  operationId: string;
  summary?: string;
  description?: string;
  tags?: string[];
  deprecated?: boolean;
  parameters?: JSONSchema[];
  requestBody?: JSONSchema;
  responses: Record<string, JSONSchema>;
  security?: Array<Record<string, string[]>>;
  servers?: Array<{ url: string }>;
  [extension: `x-${string}`]: unknown;
}

/** The document `toOpenAPI` writes. */
export interface OpenAPIDocument {
  openapi: string;
  info: { title: string; version: string; description?: string };
  servers?: Array<{ url: string; description?: string }>;
  tags?: Array<{ name: string; parent?: string }>;
  paths: Record<string, Record<string, OpenAPIOperation>>;
  components?: {
    schemas?: Record<string, JSONSchema>;
    securitySchemes?: Record<string, JSONSchema>;
  };
}
