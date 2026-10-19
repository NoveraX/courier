/**
 * OpenAPI 3.x specification parser.
 */

import { withoutAliasLoops } from "./alias-loops";
import { componentIdentifier } from "./component-identifier";
import { buildGroups } from "./openapi-groups";
import { groupEndpointsByTag } from "./openapi3-endpoints";
import { withDeclaredCompositions } from "./recursive-compositions";
import { serverUrl } from "./server-url";
import { asNode, fieldOf, listAt, nodeAt, type SpecNode, textAt } from "./spec-node";
import { tagParents } from "./tag-parents";
import { topLevelGroup } from "./top-level";
import type { ParsedSpec } from "./types";
import {
  convertSchema,
  parseSecuritySchemes,
  specText,
  stripHtml,
  stripHtmlPreserveNewlines,
} from "./utils";

/**
 * Read an OpenAPI 3 document: its endpoints in their groups, its schemas —
 * among them each composition found inside itself, declared by a name of
 * its own — and its security schemes.
 *
 * @param spec - The document, as read from its text
 * @returns The parsed specification
 * @example
 * ```ts
 * parseOpenApi3(JSON.parse(text)).groups.map((group) => group.name); // → ["pets", "store"]
 * ```
 */
export function parseOpenApi3(spec: SpecNode): ParsedSpec {
  return withDeclaredCompositions(spec, () => parsedDocument(spec));
}

function parsedDocument(spec: SpecNode): ParsedSpec {
  const info = nodeAt(spec, "info");
  const title = textAt(info, "title") ?? "API";
  const version = textAt(info, "version") ?? "1.0.0";
  const rawDescription = specText(fieldOf(info, "description"));
  const description = rawDescription ? stripHtmlPreserveNewlines(rawDescription) : "";

  const baseURL = serverUrl(spec.servers);
  const schemas = parseSchemas(spec);
  const { endpointsByTag, untaggedEndpoints, skipped } = groupEndpointsByTag(spec);
  const tagDescriptions = parseTagDescriptions(spec);
  /* An operation with no tag is in no group: it sits in the API itself. */
  const groups = [
    ...(untaggedEndpoints.length > 0 ? [topLevelGroup(untaggedEndpoints)] : []),
    ...buildGroups(endpointsByTag, tagDescriptions, tagParents(spec)),
  ];
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
    /* Grouped by tag, an API that tags no operation has no group at all. */
    ...(endpointsByTag.size === 0 && untaggedEndpoints.length > 0 && { untagged: true }),
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
  return withoutAliasLoops(schemas);
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
