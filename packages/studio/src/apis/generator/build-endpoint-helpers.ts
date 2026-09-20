/**
 * Helper functions for building the builder chain that describes an endpoint.
 */

import type { ParsedEndpoint, ParsedSpec } from "../parser/types";
import { getSchemaRefName } from "./schema-utils";
import type { GenerateOptions } from "./types";

/** Check if body schema has an explicit interface with documented properties */
export function resolveBodyInterfaceType(
  spec: ParsedSpec,
  options: GenerateOptions,
  hasSchema: boolean,
  bodyRef: string | null,
  schemaImports: Set<string>,
  pathParams: ParsedEndpoint["parameters"],
): string | null {
  if (!hasSchema || !bodyRef || !schemaImports.has(bodyRef)) return null;
  if (!options.includeComments || !options.generateTypes) return null;

  const bodySchema = spec.schemas[bodyRef];
  if (!bodySchema?.properties) return null;
  if (!Object.values(bodySchema.properties).some((p) => p.description)) return null;

  if (pathParams.length === 0) return bodyRef;

  const paramParts = pathParams.map((p) => {
    const key = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(p.name) ? p.name : `"${p.name}"`;
    return `${key}: string`;
  });
  return `${bodyRef} & { ${paramParts.join("; ")} }`;
}

/**
 * Build the chain describing an endpoint.
 *
 * It opens with the verb that reaches the endpoint, which is what says whether
 * it reads or writes. A slot carrying a schema takes it directly; one carrying
 * only a type takes a type argument, which is how an endpoint of an API that
 * publishes no usable schema is described.
 */
export function buildEndpointChain(
  address: string,
  schemaConfig: string[],
  bodyInterfaceType: string | null,
  varsType: string | null,
  responseType: string,
): string {
  const responseSchema = findConfig(schemaConfig, "response");
  const variablesSchema = findConfig(schemaConfig, "variables");
  const effectiveVarsType = bodyInterfaceType ?? varsType;

  let chain = address;

  if (variablesSchema && !bodyInterfaceType) {
    chain += `.variables(${variablesSchema})`;
  } else if (effectiveVarsType && effectiveVarsType !== "undefined") {
    chain += `.variables<${effectiveVarsType}>()`;
  }

  if (responseSchema) {
    chain += `.response(${responseSchema})`;
  } else if (responseType !== "unknown") {
    chain += `.response<${responseType}>()`;
  }

  return chain;
}

function findConfig(config: string[], key: string): string | null {
  const entry = config.find((c) => c.startsWith(`${key}:`));
  return entry ? entry.slice(key.length + 1).trim() : null;
}

/**
 * Does the chain describe the response with a schema rather than a type?
 *
 * The two are exclusive: a slot given a schema takes it directly and names no
 * type, so a type imported for a schema-described response would go unused.
 */
export function describesResponseWithSchema(
  ep: ParsedEndpoint,
  options: GenerateOptions,
  schemaImports: Set<string>,
): boolean {
  if (!options.generateSchemas || options.validation === "none") return false;
  const responseRef = getSchemaRefName(ep.responseSchema);
  return responseRef !== null && schemaImports.has(responseRef);
}
