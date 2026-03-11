/**
 * Helper functions for building endpoint() call expressions.
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

/** Build the endpoint<R, V>({ config }) expression */
export function buildEndpointCall(
  configParts: string[],
  schemaConfig: string[],
  bodyInterfaceType: string | null,
  varsType: string | null,
  responseType: string,
): string {
  if (configParts.length > 0) {
    const hasSchemaVars = schemaConfig.some((s) => s.startsWith("variables:"));
    const effectiveVarsType = bodyInterfaceType ?? varsType;
    const needsVarsGeneric =
      effectiveVarsType &&
      effectiveVarsType !== "undefined" &&
      (!hasSchemaVars || bodyInterfaceType);
    if (needsVarsGeneric) {
      return `endpoint<${responseType}, ${effectiveVarsType}>({ ${configParts.join(", ")} })`;
    }
    if (responseType !== "unknown") {
      return `endpoint<${responseType}>({ ${configParts.join(", ")} })`;
    }
    return `endpoint({ ${configParts.join(", ")} })`;
  }

  if (varsType && varsType !== "undefined") {
    return `endpoint<${responseType}, ${varsType}>()`;
  }
  return `endpoint<${responseType}>()`;
}
