/**
 * Validation-related audit hints (security category).
 *
 * Extracted from `rules-hints.ts` so each category lives in its own module.
 * Reports endpoints missing variables / response schemas, plus catalog
 * endpoints that have no schema at all (filtered to those that were never
 * called so we don't double-report alongside warnings).
 */

import type { Catalog } from "../../store/types-ui";
import type { AuditEndpoint, AuditItem, EndpointStats } from "./types";
import { formatEndpoint } from "./hints-utils";

export function noResponseValidation(stats: Map<string, EndpointStats>): AuditItem[] {
  const matched = [...stats.values()].filter((s) => !s.hasResponseValidation);
  if (matched.length === 0) return [];
  return [{
    id: "hint-no-res-val",
    severity: "hint",
    category: "security",
    title: "No response validation",
    description: "Endpoints without a response schema — malformed data may slip through.",
    suggestion: "Add a response schema with Zod, Valibot, or ArkType.",
    codeSuggestion: `endpoint<User>({\n  response: z.object({\n    id: z.number(),\n    name: z.string(),\n  }),\n})((http) => http.get("users/1"));`,
    endpoints: matched.map(formatEndpoint),
  }];
}

export function noVariablesValidation(stats: Map<string, EndpointStats>): AuditItem[] {
  const matched = [...stats.values()].filter((s) => !s.hasVariablesValidation);
  if (matched.length === 0) return [];
  return [{
    id: "hint-no-var-val",
    severity: "hint",
    category: "security",
    title: "No input validation",
    description: "Endpoints send unvalidated variables to the server.",
    suggestion: "Add a variables schema to validate inputs before sending.",
    codeSuggestion: `endpoint<Response, { id: number }>({\n  variables: z.object({ id: z.number() }),\n})((http, vars) => http.get(\`users/\${vars.id}\`));`,
    endpoints: matched.map(formatEndpoint),
  }];
}

/** Only reports catalog endpoints that were NOT called. */
export function missingAllSchemas(
  stats: Map<string, EndpointStats>,
  catalog: Catalog,
): AuditItem[] {
  const calledKeys = new Set(stats.keys());
  const matched: AuditEndpoint[] = [];
  for (const [src, entry] of Object.entries(catalog)) {
    for (const [grp, group] of Object.entries(entry.groups)) {
      for (const [ep, cfg] of Object.entries(group.endpoints)) {
        const key = `${src}:${grp}:${ep}`;
        if (calledKeys.has(key)) continue;
        if (!cfg.hasVariablesSchema && !cfg.hasResponseSchema) {
          const label = grp ? `${src}.${grp}.${ep}` : `${src}.${ep}`;
          matched.push({ key, label });
        }
      }
    }
  }
  if (matched.length === 0) return [];
  return [{
    id: "hint-no-schema",
    severity: "hint",
    category: "best-practices",
    title: "No schemas at all",
    description: "Uncalled endpoints with neither variables nor response schema.",
    suggestion: "Add type-safe schemas for full validation coverage.",
    endpoints: matched,
  }];
}
