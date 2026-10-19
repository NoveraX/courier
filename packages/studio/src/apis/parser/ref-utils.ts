/**
 * Ref resolution and security scheme parsing utilities.
 */

import { asNode, fieldOf, isNode, nodeAt, textAt } from "./spec-node";
import type { ParsedSecurityScheme, SpecNode } from "./types";

/**
 * Follow a local JSON pointer.
 *
 * A pointer into another file, or one this document never defines, resolves
 * to nothing rather than to a partly-walked object — callers decide what an
 * unresolved reference means. `~1` and `~0` are the escapes a pointer uses for
 * a slash and a tilde inside a key; a pointer whose percent escape decodes to
 * no text names no key, and resolves to nothing too.
 */
export function resolveRef(spec: SpecNode, ref: string): SpecNode {
  if (typeof ref !== "string" || !ref.startsWith("#/")) return {};

  let result: unknown = spec;
  for (const part of ref.slice(2).split("/")) {
    if (!isNode(result)) return {};
    const key = decodePointer(part);
    if (key === undefined) return {};
    result = fieldOf(result, key);
  }
  return asNode(result);
}

/* A pointer's segment as the key it names, or `undefined` when its percent escapes decode to no text. */
function decodePointer(part: string): string | undefined {
  const decoded = percentDecoded(part);
  return decoded?.replace(/~1/g, "/").replace(/~0/g, "~");
}

function percentDecoded(part: string): string | undefined {
  if (!part.includes("%")) return part;
  try {
    return decodeURIComponent(part);
  } catch (error) {
    if (error instanceof URIError) return undefined;
    throw error;
  }
}

/* A component schema, as OpenAPI 3 and Swagger 2.0 each address one. */
const COMPONENT = /^#\/(?:components\/schemas|definitions)\/([^/]+)$/;

/**
 * The name of the component schema a reference points at, as the
 * specification spells it.
 *
 * @param ref - The reference
 * @returns The component's name, or `undefined` for a reference pointing
 *   anywhere else — into a path, a response, another schema's property, or
 *   another document — and for a name whose percent escape decodes to no
 *   text, which no component is named by
 * @example
 * ```ts
 * componentSchemaName("#/components/schemas/Pet"); // "Pet"
 * componentSchemaName("#/paths/~1pets/get/responses/200"); // undefined
 * ```
 */
export function componentSchemaName(ref: string): string | undefined {
  const name = COMPONENT.exec(ref)?.[1];
  return name === undefined ? undefined : decodePointer(name);
}

/** Parse security schemes from OpenAPI 3 or Swagger 2 spec */
export function parseSecuritySchemes(spec: SpecNode): ParsedSecurityScheme[] {
  const declared =
    nodeAt(nodeAt(spec, "components"), "securitySchemes") ??
    nodeAt(spec, "securityDefinitions") ??
    {};
  const schemes: ParsedSecurityScheme[] = [];

  for (const [name, def] of Object.entries(declared)) {
    const d = asNode(def);
    if (d.type === "http" && d.scheme === "bearer") {
      schemes.push({ name, type: "bearer" });
    } else if (d.type === "http" && d.scheme === "basic") {
      schemes.push({ name, type: "basic" });
    } else if (d.type === "apiKey") {
      schemes.push({ name, type: "apiKey", paramName: textAt(d, "name"), in: placeOf(d.in) });
    } else if (d.type === "oauth2") {
      schemes.push({ name, type: "oauth2" });
    } else {
      schemes.push({ name, type: "unknown" });
    }
  }

  return schemes;
}

function placeOf(value: unknown): "query" | "header" | "cookie" | undefined {
  return value === "query" || value === "header" || value === "cookie" ? value : undefined;
}
