/**
 * Ref resolution and security scheme parsing utilities.
 */

import type { ParsedSecurityScheme, SpecNode } from "./types";

/**
 * Follow a local JSON pointer.
 *
 * A pointer into another file, or one this document never defines, resolves
 * to nothing rather than to a partly-walked object — callers decide what an
 * unresolved reference means. `~1` and `~0` are the escapes a pointer uses for
 * a slash and a tilde inside a key.
 */
export function resolveRef(spec: SpecNode, ref: string): SpecNode {
  if (typeof ref !== "string" || !ref.startsWith("#/")) return {};

  let result: SpecNode | undefined = spec;
  for (const part of ref.slice(2).split("/")) {
    if (!result || typeof result !== "object") return {};
    result = result[decodePointer(part)];
  }
  return result ?? {};
}

function decodePointer(part: string): string {
  return decodeURIComponent(part).replace(/~1/g, "/").replace(/~0/g, "~");
}

/** Parse security schemes from OpenAPI 3 or Swagger 2 spec */
export function parseSecuritySchemes(spec: SpecNode): ParsedSecurityScheme[] {
  const raw = spec.components?.securitySchemes ?? spec.securityDefinitions ?? {};
  const schemes: ParsedSecurityScheme[] = [];

  for (const [name, def] of Object.entries(raw)) {
    const d = def as SpecNode;
    if (d.type === "http" && d.scheme === "bearer") {
      schemes.push({ name, type: "bearer" });
    } else if (d.type === "http" && d.scheme === "basic") {
      schemes.push({ name, type: "basic" });
    } else if (d.type === "apiKey") {
      schemes.push({ name, type: "apiKey", paramName: d.name, in: d.in });
    } else if (d.type === "oauth2") {
      schemes.push({ name, type: "oauth2" });
    } else {
      schemes.push({ name, type: "unknown" });
    }
  }

  return schemes;
}
