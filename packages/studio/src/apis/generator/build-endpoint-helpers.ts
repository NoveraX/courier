/**
 * Helper functions for building the builder chain that describes an endpoint.
 */

import type { ParsedEndpoint, ParsedSpec } from "../parser/types";
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
 * Build the builder chain that describes an endpoint, up to but excluding the
 * terminal.
 *
 * A slot carrying a schema takes it directly; one carrying only a type takes a
 * type argument, which is how an endpoint of an API that publishes no usable
 * schema is described.
 */
export function buildEndpointChain(
  head: "query" | "mutation",
  schemaConfig: string[],
  bodyInterfaceType: string | null,
  varsType: string | null,
  responseType: string,
): string {
  const responseSchema = findConfig(schemaConfig, "response");
  const variablesSchema = findConfig(schemaConfig, "variables");
  const effectiveVarsType = bodyInterfaceType ?? varsType;

  let chain = head;

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
