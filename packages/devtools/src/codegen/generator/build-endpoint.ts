/**
 * Builds endpoint() call expressions for group generation.
 */

import type { ParsedEndpoint, ParsedSpec } from "../parser/types";
import { resolveResponseType, resolveVariablesType } from "./schema-types";
import { extendSchemaWithParams, getSchemaRefName } from "./schema-utils";
import type { GenerateOptions } from "./types";

export function buildEndpointDefinition(
  ep: ParsedEndpoint,
  spec: ParsedSpec,
  options: GenerateOptions,
  schemaImports: Set<string>,
): string {
  const hasSchema = options.generateSchemas && options.validation !== "none";
  const responseRef = getSchemaRefName(ep.responseSchema);
  const bodyRef = getSchemaRefName(ep.requestBody);

  // Determine if we need schema config
  const schemaConfig: string[] = [];
  if (hasSchema && responseRef && schemaImports.has(responseRef)) {
    let schemaExpr = `${responseRef}Schema`;
    if (ep.responseSchema?.type === "array") {
      if (options.validation === "zod") schemaExpr = `z.array(${responseRef}Schema)`;
      else if (options.validation === "valibot") schemaExpr = `v.array(${responseRef}Schema)`;
      else if (options.validation === "arktype") schemaExpr = `${responseRef}Schema.array()`;
    }
    schemaConfig.push(`response: ${schemaExpr}`);
  }

  // Build variables schema — merge body schema with path params when both exist
  const pathParams = ep.parameters.filter((p) => p.in === "path");
  if (hasSchema && bodyRef && schemaImports.has(bodyRef)) {
    if (pathParams.length > 0) {
      const varsExpr = extendSchemaWithParams(
        `${bodyRef}Schema`,
        pathParams.map((p) => p.name),
        options,
      );
      schemaConfig.push(`variables: ${varsExpr}`);
    } else {
      schemaConfig.push(`variables: ${bodyRef}Schema`);
    }
  }

  // Type annotation for endpoint type
  const typeConfig: string[] = [];
  if (ep.httpMethod === "get") {
    typeConfig.push(`type: "query"`);
  }

  // Resolve explicit types for generics
  const responseType = resolveResponseType(ep, spec, options);
  const varsType = resolveVariablesType(ep, spec, options);

  // Check if body schema has an explicit interface (properties with descriptions)
  const bodyInterfaceType = resolveBodyInterfaceType(
    ep,
    spec,
    options,
    hasSchema,
    bodyRef,
    schemaImports,
    pathParams,
  );

  const configParts = [...schemaConfig, ...typeConfig];

  // Build the endpoint() call
  const epCall = buildEndpointCall(
    configParts,
    schemaConfig,
    bodyInterfaceType,
    varsType,
    responseType,
  );

  // Build the function body
  const httpMethod = ep.httpMethod === "delete" ? "del" : ep.httpMethod;
  const path = ep.path === "/" ? "" : ep.path.replace(/^\//, "");

  const hasPathParams = ep.parameters.some((p) => p.in === "path");
  const hasQueryParams = ep.parameters.some((p) => p.in === "query");
  const hasBody = ep.requestBody !== null;
  const hasVars = hasPathParams || hasBody || hasQueryParams;

  let fnBody: string;
  if (hasVars) {
    fnBody = `(http, vars) => http.${httpMethod}("${path}"${path || hasVars ? ", vars" : ""})`;
  } else {
    fnBody = `(http) => http.${httpMethod}("${path}")`;
  }

  return `${epCall}(${fnBody})`;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function resolveBodyInterfaceType(
  _ep: ParsedEndpoint,
  spec: ParsedSpec,
  options: GenerateOptions,
  hasSchema: boolean,
  bodyRef: string | null,
  schemaImports: Set<string>,
  pathParams: ParsedEndpoint["parameters"],
): string | null {
  if (
    !hasSchema ||
    !bodyRef ||
    !schemaImports.has(bodyRef) ||
    !options.includeComments ||
    !options.generateTypes
  ) {
    return null;
  }

  const bodySchema = spec.schemas[bodyRef];
  if (!bodySchema?.properties || !Object.values(bodySchema.properties).some((p) => p.description)) {
    return null;
  }

  let result = bodyRef;
  if (pathParams.length > 0) {
    const paramParts = pathParams.map((p) => {
      const key = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(p.name) ? p.name : `"${p.name}"`;
      return `${key}: string`;
    });
    result = `${bodyRef} & { ${paramParts.join("; ")} }`;
  }
  return result;
}

function buildEndpointCall(
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
    return `endpoint({ ${configParts.join(", ")} })`;
  }

  if (varsType && varsType !== "undefined") {
    return `endpoint<${responseType}, ${varsType}>()`;
  }
  return `endpoint<${responseType}>()`;
}
