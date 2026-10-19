import { isOperationKey, isSupportedMethod } from "./http-methods";
import { parseOpenApi3Operation } from "./parse-openapi3-operation";
import { isNode, listAt, nodeAt, type SpecNode, textAt } from "./spec-node";
import type { ParsedEndpoint, SkippedOperation } from "./types";
import { resolveRef } from "./utils";

/** An OpenAPI 3 document's operations, as endpoints, by the first tag each carries. */
export interface TaggedEndpoints {
  endpointsByTag: Map<string, ParsedEndpoint[]>;
  /** The operations that declare no tag. */
  untaggedEndpoints: ParsedEndpoint[];
  skipped: SkippedOperation[];
}

/**
 * Read every operation of an OpenAPI 3 document's paths into an endpoint,
 * grouped by the first tag it carries, and say which operations could not
 * be read and why.
 *
 * @param spec - The whole specification
 * @returns The endpoints by tag, those with no tag, and what was skipped
 * @example
 * ```ts
 * const { endpointsByTag, untaggedEndpoints, skipped } = groupEndpointsByTag(spec);
 * ```
 */
export function groupEndpointsByTag(spec: SpecNode): TaggedEndpoints {
  const endpointsByTag = new Map<string, ParsedEndpoint[]>();
  const untaggedEndpoints: ParsedEndpoint[] = [];
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

    for (const [method, operation] of operationsOf(item)) {
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
      const tags = listAt(op, "tags").filter((tag): tag is string => typeof tag === "string");
      const endpoint = parseOpenApi3Operation(path, method, op, spec, (reason) =>
        skipped.push({ method: method.toUpperCase(), path, reason }),
      );
      endpoint.tags = tags;

      const [tag] = tags;
      if (tag === undefined) {
        untaggedEndpoints.push(endpoint);
        continue;
      }
      if (!endpointsByTag.has(tag)) endpointsByTag.set(tag, []);
      endpointsByTag.get(tag)?.push(endpoint);
    }
  }
  return { endpointsByTag, untaggedEndpoints, skipped };
}

/**
 * The operations a path item declares: its fixed fields, `get` to `query`,
 * then the verbs OpenAPI 3.2 lists under `additionalOperations` by the name
 * HTTP spells them with. A verb written there that has a field of its own
 * is read from the field when both are present.
 */
function operationsOf(item: SpecNode): Array<[method: string, operation: unknown]> {
  const fixed = Object.entries(item).filter(([key]) => isOperationKey(key));
  const named = new Set(fixed.map(([key]) => key));
  const additional = Object.entries(nodeAt(item, "additionalOperations") ?? {})
    .map(([name, operation]): [string, unknown] => [name.toLowerCase(), operation])
    .filter(([method]) => !named.has(method));
  return [...fixed, ...additional];
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
