/**
 * Builds endpoint() call expressions for group generation.
 */

import { toInternalMethod } from "@noverax/courier";
import type { ParsedEndpoint, ParsedSchema, ParsedSpec } from "../parser/types";
import { buildEndpointCall, resolveBodyInterfaceType } from "./build-endpoint-helpers";
import { resolveResponseType, resolveVariablesType } from "./schema-types";
import { extendSchemaWithParams, getSchemaRefName } from "./schema-utils";
import type { ResolvedGenerateOptions } from "./types";

export function buildEndpointDefinition(
  ep: ParsedEndpoint,
  spec: ParsedSpec,
  options: ResolvedGenerateOptions,
  schemaImports: Set<string>,
  extracted?: Record<string, ParsedSchema>,
): string {
  const hasSchema = options.generateSchemas && options.validation !== "none";
  const schemaConfig = buildSchemaConfig(ep, options, hasSchema, schemaImports);
  const typeConfig: string[] = ep.httpMethod === "get" ? [`type: "query"`] : [];

  const responseType = resolveResponseType(ep, spec, options);
  const paramsName = `${toPascalCase(ep.name)}Params`;
  const varsType = extracted?.[paramsName] ? paramsName : resolveVariablesType(ep, spec, options);
  const pathParams = ep.parameters.filter((p) => p.in === "path");

  const bodyInterfaceType = resolveBodyInterfaceType(
    spec,
    options,
    hasSchema,
    getSchemaRefName(ep.requestBody),
    schemaImports,
    pathParams,
  );

  const configParts = [...schemaConfig, ...typeConfig];
  const epCall = buildEndpointCall(
    configParts,
    schemaConfig,
    bodyInterfaceType,
    varsType,
    responseType,
  );
  const fnBody = buildFnBody(ep);

  return `${epCall}(${fnBody})`;
}

function buildSchemaConfig(
  ep: ParsedEndpoint,
  options: ResolvedGenerateOptions,
  hasSchema: boolean,
  schemaImports: Set<string>,
): string[] {
  const config: string[] = [];
  const responseRef = getSchemaRefName(ep.responseSchema);
  const bodyRef = getSchemaRefName(ep.requestBody);

  if (hasSchema && responseRef && schemaImports.has(responseRef)) {
    config.push(`response: ${buildResponseExpr(responseRef, ep, options)}`);
  }

  if (hasSchema && bodyRef && schemaImports.has(bodyRef)) {
    const pathParams = ep.parameters.filter((p) => p.in === "path");
    if (pathParams.length > 0) {
      const varsExpr = extendSchemaWithParams(
        `${bodyRef}Schema`,
        pathParams.map((p) => p.name),
        options,
      );
      config.push(`variables: ${varsExpr}`);
    } else {
      config.push(`variables: ${bodyRef}Schema`);
    }
  }

  return config;
}

function buildResponseExpr(
  responseRef: string,
  ep: ParsedEndpoint,
  options: ResolvedGenerateOptions,
): string {
  let expr = `${responseRef}Schema`;
  if (ep.responseSchema?.type === "array") {
    if (options.validation === "zod") expr = `z.array(${responseRef}Schema)`;
    else if (options.validation === "valibot") expr = `v.array(${responseRef}Schema)`;
    else if (options.validation === "arktype") expr = `${responseRef}Schema.array()`;
  }
  return expr;
}

function toPascalCase(name: string): string {
  return name.charAt(0).toUpperCase() + name.slice(1);
}

function buildFnBody(ep: ParsedEndpoint): string {
  const httpMethod = toInternalMethod(ep.httpMethod);
  const path = ep.path === "/" ? "" : ep.path.replace(/^\//, "");
  const hasVars =
    ep.parameters.some((p) => p.in === "path" || p.in === "query") || ep.requestBody !== null;

  if (hasVars) {
    return `(http, vars) => http.${httpMethod}("${path}"${path || hasVars ? ", vars" : ""})`;
  }
  return `(http) => http.${httpMethod}("${path}")`;
}
