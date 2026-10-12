import { withoutTrailingSlashes } from "@noverax/courier/internal";

import type { ParsedSpec } from "./parser/types";

/* A URL with a scheme of its own is absolute. */
const ABSOLUTE = /^[a-z][a-z0-9+.-]*:/i;

/**
 * Make a specification's server address absolute against the URL it was
 * read from. OpenAPI lets a server URL be relative to the document — the
 * Petstore spec at `https://petstore3.swagger.io/api/v3/openapi.json` names
 * its server `/api/v3` — and a spec without servers means `/`; either is
 * where the document is served, which a generated client must call.
 *
 * @param spec - The specification as parsed
 * @param specUrl - The URL it was read from
 * @returns The specification with an absolute `baseURL`; as it was when that is absolute already
 * @example
 * ```ts
 * resolveBaseURL({ ...spec, baseURL: "/api/v3" }, "https://petstore3.swagger.io/api/v3/openapi.json").baseURL;
 * // → "https://petstore3.swagger.io/api/v3"
 * ```
 */
export function resolveBaseURL(spec: ParsedSpec, specUrl: string): ParsedSpec {
  if (ABSOLUTE.test(spec.baseURL)) return spec;
  const resolved = withoutTrailingSlashes(new URL(spec.baseURL || "/", specUrl).href);
  return { ...spec, baseURL: resolved };
}
