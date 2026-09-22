/**
 * Builds the builder chain describing each endpoint of a generated group.
 */

import { toInternalMethod } from "@noverax/courier";
import type { ParsedEndpoint, ParsedSchema, ParsedSpec } from "../parser/types";
import { buildEndpointChain } from "./build-endpoint-helpers";
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
  const schemaConfig = buildSchemaConfig(ep, spec, options, hasSchema, schemaImports);

  const responseType = resolveResponseType(ep, spec, options);
  const paramsName = `${toPascalCase(ep.name)}Params`;
  /* An extracted params type is only written to disk when a types file is
     generated; without one, the shape is named where it is used. */
  const named = options.generateTypes && extracted?.[paramsName] ? paramsName : null;
  const varsType = named ?? resolveVariablesType(ep, spec, options);

  return buildEndpointChain(address(ep), schemaConfig, varsType, responseType);
}

/** Where the endpoint is, named by the verb that reaches it. */
function address(ep: ParsedEndpoint): string {
  const method = toInternalMethod(ep.httpMethod);
  const path = ep.path === "/" ? "" : ep.path.replace(/^\//, "");
  return `endpoint.${method}("${path}")`;
}

function buildSchemaConfig(
  ep: ParsedEndpoint,
  spec: ParsedSpec,
  options: ResolvedGenerateOptions,
  hasSchema: boolean,
  schemaImports: Set<string>,
): string[] {
  const config: string[] = [];
  const responseRef = getSchemaRefName(ep.responseSchema);
  const bodyRef = getSchemaRefName(ep.requestBody);

  if (hasSchema && responseRef && schemaImports.has(responseRef)) {
    config.push(`response: ${schemaExpr(responseRef, ep.responseSchema, options)}`);
  }

  if (hasSchema && bodyRef && schemaImports.has(bodyRef)) {
    const body = schemaExpr(bodyRef, ep.requestBody, options);
    const pathParams = ep.parameters.filter((p) => p.in === "path");
    if (pathParams.length > 0) {
      /* Only an object can be extended; a list or a set of alternatives has
         to be intersected with the path parameters instead. */
      const isObject = ep.requestBody?.type !== "array" && spec.schemas[bodyRef]?.type !== "union";
      config.push(
        `variables: ${extendSchemaWithParams(
          body,
          pathParams.map((p) => p.name),
          options,
          isObject,
        )}`,
      );
    } else {
      config.push(`variables: ${body}`);
    }
  }

  return config;
}

/**
 * The validator for a named schema, wrapped when the payload is a list.
 *
 * A request body that is an array was expressed as the schema of one element,
 * so the validator rejected the very payload the endpoint requires.
 */
function schemaExpr(
  ref: string,
  schema: ParsedSchema | null,
  options: ResolvedGenerateOptions,
): string {
  const named = `${ref}Schema`;
  if (schema?.type !== "array") return named;
  if (options.validation === "zod") return `z.array(${named})`;
  if (options.validation === "valibot") return `v.array(${named})`;
  if (options.validation === "arktype") return `${named}.array()`;
  return named;
}

function toPascalCase(name: string): string {
  return name.charAt(0).toUpperCase() + name.slice(1);
}
