/**
 * OpenAPI 3.x specification parser.
 */

import { componentIdentifier } from "./component-identifier";
import { isOperationKey, isSupportedMethod } from "./http-methods";
import { buildGroups } from "./openapi-groups";
import { parseOpenApi3Operation } from "./parse-openapi3-operation";
import { serverUrl } from "./server-url";
import { asNode, fieldOf, isNode, listAt, nodeAt, type SpecNode, textAt } from "./spec-node";
import type { ParsedEndpoint, ParsedSpec, SkippedOperation } from "./types";
import {
  convertSchema,
  parseSecuritySchemes,
  resolveRef,
  specText,
  stripHtml,
  stripHtmlPreserveNewlines,
} from "./utils";

export function parseOpenApi3(spec: SpecNode): ParsedSpec {
  const info = nodeAt(spec, "info");
  const title = textAt(info, "title") ?? "API";
  const version = textAt(info, "version") ?? "1.0.0";
  const rawDescription = specText(fieldOf(info, "description"));
  const description = rawDescription ? stripHtmlPreserveNewlines(rawDescription) : "";

  const baseURL = serverUrl(spec.servers);
  const schemas = parseSchemas(spec);
  const { endpointsByTag, skipped } = groupEndpointsByTag(spec);
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
    skipped,
  };
}

function parseSchemas(spec: SpecNode): Record<string, ReturnType<typeof convertSchema>> {
  const schemas: Record<string, ReturnType<typeof convertSchema>> = {};
  const declared = nodeAt(nodeAt(spec, "components"), "schemas");
  if (!declared) return schemas;

  for (const [name, schema] of Object.entries(declared)) {
    const identifier = componentIdentifier(spec, name);
    schemas[identifier] = convertSchema(identifier, asNode(schema), spec);
  }
  return schemas;
}

function groupEndpointsByTag(spec: SpecNode): {
  endpointsByTag: Map<string, ParsedEndpoint[]>;
  skipped: SkippedOperation[];
} {
  const endpointsByTag = new Map<string, ParsedEndpoint[]>();
  const skipped: SkippedOperation[] = [];

  for (const [path, methods] of Object.entries(nodeAt(spec, "paths") ?? {})) {
    /* A path item may be null in YAML, or a reference this file cannot
       resolve; either is skipped rather than taking the whole import down. */
    if (!isNode(methods)) {
      skipped.push({ method: "ALL", path, reason: "path item is empty" });
      continue;
    }

    /* A path item written as a reference is followed within this document,
       to `components.pathItems` say; one into another document a single-file
       parse cannot follow, so it says so rather than lose it. */
    const item = pathItemOf(spec, methods);
    if (typeof item === "string") {
      skipped.push({ method: "ALL", path, reason: item });
      continue;
    }

    /* Parameters declared once on the path item apply to every operation
       under it — Kubernetes and Asana declare their path parameters there,
       and ignoring them left 191 of Asana's 249 endpoints with a placeholder
       no caller could fill. */
    const shared = listAt(item, "parameters");

    for (const [method, operation] of Object.entries(item)) {
      if (!isOperationKey(method)) continue;
      if (!isNode(operation)) continue;
      if (!isSupportedMethod(method)) {
        skipped.push({
          method: method.toUpperCase(),
          path,
          reason: `${method.toUpperCase()} has no counterpart in the endpoint builder`,
        });
        continue;
      }

      const op: SpecNode =
        shared.length > 0
          ? { ...operation, parameters: [...listAt(operation, "parameters"), ...shared] }
          : operation;
      const declaredTags = listAt(op, "tags").filter(
        (tag): tag is string => typeof tag === "string",
      );
      const tags = declaredTags.length > 0 ? declaredTags : ["default"];
      const [tag = "default"] = tags;
      const endpoint = parseOpenApi3Operation(path, method, op, spec, (reason) =>
        skipped.push({ method: method.toUpperCase(), path, reason }),
      );
      endpoint.tags = tags;

      if (!endpointsByTag.has(tag)) endpointsByTag.set(tag, []);
      endpointsByTag.get(tag)?.push(endpoint);
    }
  }
  return { endpointsByTag, skipped };
}

/* The path item a reference names, its own fields beside the reference
   kept; or why it cannot be read. */
function pathItemOf(spec: SpecNode, item: SpecNode): SpecNode | string {
  const ref = textAt(item, "$ref");
  if (ref === undefined) return item;
  const target = ref.startsWith("#/") ? resolveRef(spec, ref) : {};
  if (Object.keys(target).length === 0 || textAt(target, "$ref") !== undefined) {
    return `path item references ${ref}, which is not in this document`;
  }
  const { $ref: _ref, ...own } = item;
  return { ...target, ...own };
}

function parseTagDescriptions(spec: SpecNode): Map<string, string> {
  const tagDescriptions = new Map<string, string>();
  for (const tag of listAt(spec, "tags")) {
    const name = specText(fieldOf(tag, "name"));
    const description = specText(fieldOf(tag, "description"));
    if (name && description) {
      tagDescriptions.set(name, stripHtml(description));
    }
  }
  return tagDescriptions;
}
