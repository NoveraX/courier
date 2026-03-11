/**
 * Ref resolution and security scheme parsing utilities.
 */

import type { ParsedSecurityScheme } from "./types";

export function resolveRef(spec: any, ref: string): any {
  const parts = ref.replace("#/", "").split("/");
  let result = spec;
  for (const part of parts) {
    result = result?.[part];
  }
  return result ?? {};
}

/** Parse security schemes from OpenAPI 3 or Swagger 2 spec */
export function parseSecuritySchemes(spec: any): ParsedSecurityScheme[] {
  const raw = spec.components?.securitySchemes ?? spec.securityDefinitions ?? {};
  const schemes: ParsedSecurityScheme[] = [];

  for (const [name, def] of Object.entries(raw)) {
    const d = def as any;
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
