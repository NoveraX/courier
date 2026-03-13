/**
 * OpenAPI 3.x specification parser.
 */

import { parseOpenApi3Operation } from "./parse-openapi3-operation";
import type { ParsedEndpoint, ParsedGroup, ParsedSpec, SpecNode } from "./types";
import {
  convertPathParams,
  convertSchema,
  findCommonPrefix,
  parseSecuritySchemes,
  stripHtml,
  stripHtmlPreserveNewlines,
  toCamelCase,
  toSafeIdentifier,
} from "./utils";

export function parseOpenApi3(spec: SpecNode): ParsedSpec {
  const title = spec.info?.title ?? "API";
  const version = spec.info?.version ?? "1.0.0";
  const description = spec.info?.description
    ? stripHtmlPreserveNewlines(spec.info.description)
    : "";

  let baseURL = "/";
  if (spec.servers?.length > 0) {
    baseURL = spec.servers[0].url ?? "/";
  }

  const schemas = parseSchemas(spec);
  const endpointsByTag = groupEndpointsByTag(spec);
  const tagDescriptions = parseTagDescriptions(spec);
  const groups = buildGroups(endpointsByTag, tagDescriptions);
  const securitySchemes = parseSecuritySchemes(spec);

  return {
    title,
    version,
    description,
    baseURL,
    format: "openapi3",
    groups,
    schemas,
    securitySchemes,
  };
}

function parseSchemas(spec: SpecNode): Record<string, ReturnType<typeof convertSchema>> {
  const schemas: Record<string, ReturnType<typeof convertSchema>> = {};
  if (!spec.components?.schemas) return schemas;

  for (const [name, schema] of Object.entries(spec.components.schemas)) {
    const safeName = toSafeIdentifier(name);
    if (schemas[safeName]) continue;
    schemas[safeName] = convertSchema(safeName, schema as SpecNode);
  }
  return schemas;
}

function groupEndpointsByTag(spec: SpecNode): Map<string, ParsedEndpoint[]> {
  const endpointsByTag = new Map<string, ParsedEndpoint[]>();

  for (const [path, methods] of Object.entries(spec.paths ?? {})) {
    for (const [method, operation] of Object.entries(methods as SpecNode)) {
      if (!["get", "post", "put", "patch", "delete"].includes(method)) continue;

      const op = operation as SpecNode;
      const tags = op.tags?.length > 0 ? op.tags : ["default"];
      const tag = tags[0] as string;
      const endpoint = parseOpenApi3Operation(path, method, op, spec);
      endpoint.tags = tags;

      if (!endpointsByTag.has(tag)) endpointsByTag.set(tag, []);
      endpointsByTag.get(tag)?.push(endpoint);
    }
  }
  return endpointsByTag;
}

function parseTagDescriptions(spec: SpecNode): Map<string, string> {
  const tagDescriptions = new Map<string, string>();
  if (!Array.isArray(spec.tags)) return tagDescriptions;

  for (const tag of spec.tags) {
    if (tag.name && tag.description) {
      tagDescriptions.set(tag.name, stripHtml(tag.description));
    }
  }
  return tagDescriptions;
}

function buildGroups(
  endpointsByTag: Map<string, ParsedEndpoint[]>,
  tagDescriptions: Map<string, string>,
): ParsedGroup[] {
  const groups: ParsedGroup[] = [];
  const usedNames = new Set<string>();

  for (const [tag, endpoints] of endpointsByTag) {
    const prefix = findCommonPrefix(endpoints.map((e) => e.fullPath));
    const name = deduplicateName(resolveGroupName(tag, prefix), usedNames);
    usedNames.add(name);

    groups.push({
      name,
      description: tagDescriptions.get(tag) ?? "",
      prefix,
      endpoints: endpoints.map((e) => ({
        ...e,
        path: convertPathParams(e.fullPath.slice(prefix.length) || "/"),
      })),
    });
  }
  return groups;
}

function resolveGroupName(tag: string, prefix: string): string {
  const name = toCamelCase(tag);
  if (name) return name;
  const lastSegment = prefix.split("/").filter(Boolean).pop();
  return lastSegment ? toCamelCase(lastSegment) : "default";
}

function deduplicateName(name: string, usedNames: Set<string>): string {
  if (!usedNames.has(name)) return name;
  let i = 2;
  while (usedNames.has(`${name}${i}`)) i++;
  return `${name}${i}`;
}
