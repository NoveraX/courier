/**
 * OpenAPI 3.x specification parser.
 */

import { isOperationKey, isSupportedMethod } from "./http-methods";
import { buildGroups } from "./openapi-groups";
import { parseOpenApi3Operation } from "./parse-openapi3-operation";
import { serverUrl } from "./server-url";
import { asNode, fieldOf, isNode, listAt, nodeAt, type SpecNode, textAt } from "./spec-node";
import type { ParsedEndpoint, ParsedSpec, SkippedOperation } from "./types";
import {
  convertSchema,
  parseSecuritySchemes,
  specText,
  stripHtml,
  stripHtmlPreserveNewlines,
  toSafeIdentifier,
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
    /* Two spec names can normalise to one identifier — `user-id` and `user.id`
       both become `UserId`. Dropping the second lost a definition every
       reference to it still named. */
    let safeName = toSafeIdentifier(name);
    if (schemas[safeName]) {
      let n = 2;
      while (schemas[`${safeName}${n}`]) n += 1;
      safeName = `${safeName}${n}`;
    }
    schemas[safeName] = convertSchema(safeName, asNode(schema), spec);
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
       resolve; either used to take the whole import down. */
    if (!isNode(methods)) {
      skipped.push({ method: "ALL", path, reason: "path item is empty" });
      continue;
    }

    /* A path item written as a reference points into another document, which
       a single-file parse cannot follow — say so rather than lose it. */
    const pathRef = textAt(methods, "$ref");
    if (pathRef !== undefined) {
      skipped.push({
        method: "ALL",
        path,
        reason: `path item references ${pathRef}, which is not in this document`,
      });
      continue;
    }

    /* Parameters declared once on the path item apply to every operation
       under it — Kubernetes and Asana declare their path parameters there,
       and ignoring them left 191 of Asana's 249 endpoints with a placeholder
       no caller could fill. */
    const shared = listAt(methods, "parameters");

    for (const [method, operation] of Object.entries(methods)) {
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
      const endpoint = parseOpenApi3Operation(path, method, op, spec);
      endpoint.tags = tags;

      if (!endpointsByTag.has(tag)) endpointsByTag.set(tag, []);
      endpointsByTag.get(tag)?.push(endpoint);
    }
  }
  return { endpointsByTag, skipped };
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
