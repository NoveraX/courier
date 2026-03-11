/**
 * Creates a lightweight spec digest for storage — only the structure
 * needed for diff and breaking change detection. Strips descriptions,
 * enums, nested schemas, and other heavy fields.
 */

import type { ParsedEndpoint, ParsedGroup, ParsedSchema, ParsedSpec } from "../parser/types";
import type { DigestEndpoint, DigestGroup, DigestSchema, SpecDigest } from "./types";

export function createSpecDigest(spec: ParsedSpec): SpecDigest {
  return {
    groups: spec.groups.map(digestGroup),
    schemas: digestSchemas(spec.schemas),
  };
}

function digestGroup(group: ParsedGroup): DigestGroup {
  return {
    name: group.name,
    endpoints: group.endpoints.map(digestEndpoint),
  };
}

function digestEndpoint(ep: ParsedEndpoint): DigestEndpoint {
  return {
    name: ep.name,
    httpMethod: ep.httpMethod,
    path: ep.path,
    fullPath: ep.fullPath,
    secured: ep.secured,
    parameters: ep.parameters.map((p) => ({ in: p.in, name: p.name })),
    responseSchema: ep.responseSchema
      ? { refName: ep.responseSchema.refName, type: ep.responseSchema.type }
      : null,
    requestBody: ep.requestBody
      ? { refName: ep.requestBody.refName, type: ep.requestBody.type }
      : null,
  };
}

function digestSchemas(schemas: Record<string, ParsedSchema>): Record<string, DigestSchema> {
  const result: Record<string, DigestSchema> = {};
  for (const [name, schema] of Object.entries(schemas)) {
    const digest: DigestSchema = { name, type: schema.type };
    if (schema.properties) {
      digest.properties = {};
      for (const [prop, val] of Object.entries(schema.properties)) {
        digest.properties[prop] = { type: val.type, required: val.required };
      }
    }
    if (schema.required?.length) digest.required = schema.required;
    result[name] = digest;
  }
  return result;
}
